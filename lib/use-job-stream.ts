'use client';

// lib/use-job-stream.ts — the run lifecycle hook (Lane B).
//
// Opens a POST-then-stream connection to Lane C's `/api/run` (Server-Sent
// Events framing over a fetch body reader), folds the incoming `JobEvent`
// stream into `MarketState` per the reducer contract in the master spec, and
// exposes an imperative `run(task)` + `reset()` the TaskConsole drives.
//
// Transport-agnostic on purpose: it reads a text/event-stream body regardless
// of whether the server used a real EventSource or a streamed fetch Response.
// (EventSource cannot POST, so we use fetch + a manual SSE line parser.)

import { useCallback, useRef, useState } from 'react';
import type {
  Agent,
  Job,
  JobEvent,
  MarketState,
  Mode,
  Service,
  Settlement,
} from '@/lib/types';

const IDLE_STATE: MarketState = {
  runId: null,
  mode: 'sim',
  task: null,
  status: 'idle',
  agents: {},
  services: {},
  jobs: {},
  settlements: [],
  briefing: '',
  totalUsdc: 0,
  jobsSettled: 0,
  error: null,
};

/** Reduce one JobEvent into the next MarketState. Pure. Exported for testing. */
export function reduceEvent(state: MarketState, event: JobEvent): MarketState {
  switch (event.type) {
    case 'run.started':
      return {
        ...IDLE_STATE,
        runId: event.runId,
        mode: event.mode,
        task: event.task,
        status: 'running',
      };

    case 'task.decomposed':
      // Subtasks drive the orchestrator's fan-out; we keep state minimal here
      // (nodes/edges arrive via agent.discovered / job.created). No-op fold,
      // but we surface it so the page can show a "planning" beat if desired.
      return state;

    case 'agent.discovered': {
      const agent: Agent = event.agent;
      const service: Service = event.service;
      return {
        ...state,
        agents: { ...state.agents, [agent.id]: mergeAgent(state.agents[agent.id], agent) },
        services: { ...state.services, [service.serviceId]: service },
      };
    }

    case 'job.created': {
      const job: Job = event.job;
      return { ...state, jobs: { ...state.jobs, [job.id]: job } };
    }

    case 'job.phase': {
      const prev = state.jobs[event.jobId];
      // Trust the fully-formed job the producer sends; fall back to a phase merge.
      const next: Job = event.job ?? (prev ? { ...prev, phase: event.phase } : undefined!);
      if (!next) return state;
      return { ...state, jobs: { ...state.jobs, [event.jobId]: next } };
    }

    case 'settlement': {
      const s: Settlement = event.settlement;
      // Append newest-last (spec); TxFeed reverses for newest-first display.
      const settlements = dedupeAppend(state.settlements, s);
      return {
        ...state,
        settlements,
        totalUsdc: round6(state.totalUsdc + s.amountUsdc),
        jobsSettled: settlements.length,
      };
    }

    case 'reputation.updated': {
      const existing = state.agents[event.agentId];
      if (!existing) return state;
      return {
        ...state,
        agents: {
          ...state.agents,
          [event.agentId]: { ...existing, reputation: event.reputation },
        },
      };
    }

    case 'briefing.delta':
      return { ...state, briefing: state.briefing + event.text };

    case 'briefing.done':
      // Settle to the authoritative full text (guards against dropped chunks).
      return { ...state, briefing: event.text || state.briefing };

    case 'run.completed':
      return {
        ...state,
        status: state.status === 'error' ? 'error' : 'completed',
        totalUsdc: round6(event.totalUsdc || state.totalUsdc),
        jobsSettled: event.jobsSettled || state.jobsSettled,
      };

    case 'run.error':
      return { ...state, status: 'error', error: event.message };

    case 'raw':
      // Passthrough CROO wire envelope — no state fold; the feed may show it.
      return state;

    default:
      return state;
  }
}

function mergeAgent(prev: Agent | undefined, next: Agent): Agent {
  if (!prev) return next;
  // Preserve the higher reputation so a late discovery snapshot can't regress
  // a value that a reputation.updated already ticked up.
  return { ...prev, ...next, reputation: Math.max(prev.reputation, next.reputation) };
}

function dedupeAppend(list: Settlement[], s: Settlement): Settlement[] {
  if (list.some((x) => x.id === s.id)) return list;
  return [...list, s];
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

export interface UseJobStream {
  state: MarketState;
  isRunning: boolean;
  run: (task: string) => Promise<void>;
  reset: () => void;
}

export function useJobStream(): UseJobStream {
  const [state, setState] = useState<MarketState>(IDLE_STATE);
  const abortRef = useRef<AbortController | null>(null);
  const stateRef = useRef<MarketState>(IDLE_STATE);

  const apply = useCallback((event: JobEvent) => {
    setState((prev) => {
      const next = reduceEvent(prev, event);
      stateRef.current = next;
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    stateRef.current = IDLE_STATE;
    setState(IDLE_STATE);
  }, []);

  const run = useCallback(
    async (task: string) => {
      const trimmed = task.trim();
      if (!trimmed) return;

      // Cancel any in-flight run and start clean.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const startState: MarketState = {
        ...IDLE_STATE,
        task: trimmed,
        status: 'running',
      };
      stateRef.current = startState;
      setState(startState);

      try {
        const res = await fetch('/api/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
          body: JSON.stringify({ task: trimmed }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`Run failed to start (${res.status})`);
        }

        await consumeSSE(res.body, controller.signal, (event) => apply(event));

        // If the stream ended without a terminal event, settle to completed.
        setState((prev) => {
          if (prev.status === 'running') {
            const next = { ...prev, status: 'completed' as const };
            stateRef.current = next;
            return next;
          }
          return prev;
        });
      } catch (err) {
        if (controller.signal.aborted) return; // superseded by a newer run
        const message = err instanceof Error ? err.message : 'Unknown stream error';
        setState((prev) => {
          const next = { ...prev, status: 'error' as const, error: message };
          stateRef.current = next;
          return next;
        });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [apply],
  );

  return {
    state,
    isRunning: state.status === 'running',
    run,
    reset,
  };
}

/**
 * Parse a text/event-stream ReadableStream and dispatch each `data:` payload as
 * a JobEvent. Handles multi-line SSE frames, keep-alive comments (":"), and
 * partial chunk boundaries. Ignores non-JSON frames defensively.
 */
async function consumeSSE(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  onEvent: (event: JobEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by a blank line.
      let sep: number;
      while ((sep = indexOfFrameBoundary(buffer)) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep).replace(/^(\r?\n){1,2}/, '');
        const event = parseFrame(frame);
        if (event) onEvent(event);
      }
    }
    // Flush any trailing frame without a final blank line.
    const tail = parseFrame(buffer);
    if (tail) onEvent(tail);
  } finally {
    reader.releaseLock();
  }
}

function indexOfFrameBoundary(buffer: string): number {
  const a = buffer.indexOf('\n\n');
  const b = buffer.indexOf('\r\n\r\n');
  if (a === -1) return b;
  if (b === -1) return a;
  return Math.min(a, b);
}

function parseFrame(frame: string): JobEvent | null {
  if (!frame.trim()) return null;
  const dataLines: string[] = [];
  for (const rawLine of frame.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith(':')) continue; // keep-alive / comment
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^\s/, ''));
    }
    // `event:` / `id:` fields are ignored — the JobEvent carries its own type.
  }
  if (dataLines.length === 0) return null;
  const payload = dataLines.join('\n');
  if (payload === '[DONE]') return null;
  try {
    return JSON.parse(payload) as JobEvent;
  } catch {
    return null;
  }
}
