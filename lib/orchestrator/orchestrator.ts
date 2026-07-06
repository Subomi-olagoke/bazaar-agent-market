// lib/orchestrator/orchestrator.ts — the orchestrator algorithm.
//
// run(task, emit): decompose -> discover -> rank -> hire (money flow) -> collect
// verified deliverables -> synthesize the final briefing -> settle accounting.
// Drives the CapAdapter (SIM or LIVE) and yields the shared JobEvent stream via `emit`.
// Never dead-ends: discovery always returns >= 1 own specialist; a failed hire is caught
// per-subtask; brains have canned fallbacks; on a top-level throw we still complete with
// partials.

import type { Agent, JobEvent, Mode } from '@/lib/types';
import { resolveCapAdapter } from '@/lib/cap/adapter';
import { rank } from '@/lib/orchestrator/ranking';
import { entryByServiceId } from '@/lib/registry';
import {
  decompose,
  synthesize,
  type DeliverableInput,
  type Subtask,
} from '@/lib/agents/brief-brain';
import { nanoid } from 'nanoid';

/** The fixed orchestrator agent (the market's buyer). */
export const ORCHESTRATOR: Agent = {
  id: 'orch',
  name: 'Bazaar Orchestrator',
  role: 'orchestrator',
  origin: 'own',
  reputation: 0,
  avatarSeed: 'orch',
};

/** Bounded-concurrency map so the canvas stays lively (multiple edges animating at once). */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export interface RunOptions {
  /** Max concurrent hires. Default 3 for a lively canvas. */
  concurrency?: number;
}

/**
 * Run one full orchestration. `emit` receives every JobEvent; the caller (the SSE route)
 * forwards them to the client. Resolves when the run is complete (including on handled
 * errors — a run.completed is always emitted).
 */
export async function run(
  task: string,
  emit: (e: JobEvent) => void,
  opts: RunOptions = {},
): Promise<void> {
  const runId = nanoid();
  const at = () => Date.now();
  const concurrency = opts.concurrency ?? 3;

  const adapter = await resolveCapAdapter();
  const mode: Mode = adapter.mode;

  emit({ type: 'run.started', runId, task, mode, at: at() });

  let totalUsdc = 0;
  let jobsSettled = 0;
  const deliverables: DeliverableInput[] = [];

  // Track settlement + reputation by wrapping the emit passed to hire().
  const trackingEmit = (e: JobEvent) => {
    if (e.type === 'settlement') {
      totalUsdc += e.settlement.amountUsdc;
      jobsSettled += 1;
    }
    emit(e);
  };

  try {
    // 1. DECOMPOSE
    let subtasks: Subtask[] = [];
    try {
      subtasks = await decompose(task);
    } catch {
      subtasks = [];
    }
    if (subtasks.length === 0) {
      // decompose already falls back to canned, but belt-and-suspenders:
      const { cannedDecompose } = await import('@/lib/agents/brief-brain');
      subtasks = cannedDecompose(task);
    }
    emit({ type: 'task.decomposed', runId, subtasks: subtasks.map((s) => s.text), at: at() });

    // 2-3. For each subtask: DISCOVER -> RANK -> HIRE (bounded concurrency).
    await mapWithConcurrency(subtasks, concurrency, async (subtask) => {
      try {
        // DISCOVER — registry guarantees >= 1 candidate.
        const candidates = await adapter.discover(subtask.capabilityTag);
        for (const service of candidates) {
          const entry = entryByServiceId(service.serviceId);
          const agent =
            entry?.agent ??
            ({
              id: service.agentId,
              name: service.name,
              role: 'specialist',
              origin: service.origin,
              reputation: service.reputation,
              avatarSeed: service.agentId,
            } as Agent);
          emit({ type: 'agent.discovered', runId, agent, service, at: at() });
        }

        // RANK — pick the best candidate.
        const chosen = rank(candidates)[0] ?? candidates[0];
        if (!chosen) return; // impossible given registry guarantee, but safe.

        // HIRE — adapter drives job.created/job.phase/settlement/reputation via trackingEmit.
        const job = await adapter.hire({
          runId,
          orchestrator: ORCHESTRATOR,
          service: chosen,
          subtask: subtask.text,
          emit: trackingEmit,
        });

        if (job.deliverableText) {
          deliverables.push({
            specialistName: chosen.name,
            capabilityTag: chosen.capabilityTag,
            text: job.deliverableText,
          });
        }
      } catch (err) {
        // A single failed subtask must not kill the run — log and continue.
        console.warn('[orchestrator] subtask failed:', (err as Error)?.message);
      }
    });

    // 4. SYNTHESIZE — stream the manuscript briefing from verified deliverables.
    let briefingText = '';
    try {
      briefingText = await synthesize(task, deliverables, (chunk) => {
        emit({ type: 'briefing.delta', runId, text: chunk, at: at() });
      });
    } catch (err) {
      console.warn('[orchestrator] synthesize failed:', (err as Error)?.message);
      briefingText = '';
    }
    emit({ type: 'briefing.done', runId, text: briefingText, at: at() });

    // 5. COMPLETE
    emit({ type: 'run.completed', runId, totalUsdc, jobsSettled, at: at() });
  } catch (err) {
    // Top-level failure: report the error but still complete with partials so the UI settles.
    emit({ type: 'run.error', runId, message: (err as Error)?.message ?? 'unknown error', at: at() });
    emit({ type: 'run.completed', runId, totalUsdc, jobsSettled, at: at() });
  }
}
