// lib/cap/sim-adapter.ts — the SIMULATION CAP adapter.
//
// Drives the full JobEvent lifecycle on jittered timers with mock USDC, realistic fake
// Base tx hashes, fake keccak256 deliverable hashes, and PTS increments. Deterministic
// per (runId, jobId) seed so demos replay identically but still feel alive. The UI
// cannot tell this from the LIVE adapter — both emit the same JobEvent stream.

import type { Agent, Job, JobEvent, JobPhase, Mode, Service, Settlement } from '@/lib/types';
import type { CapAdapter } from '@/lib/cap/adapter';
import { discoverInRegistry, entryByServiceId } from '@/lib/registry';
import { specialistByAgentId } from '@/lib/agents/specialists';
import { produceDeliverable } from '@/lib/agents/provider-brain';
import {
  BASE_CHAIN_ID,
  DEFAULT_BASESCAN_TX_BASE,
  explorerTxUrl,
  fakeKeccak,
  fakeTxHash,
  seededRng,
} from '@/lib/cap/tx';
import { nanoid } from 'nanoid';

/** Resolve chain + explorer config, tolerating a missing Lane C config. */
async function chainConfig(): Promise<{ chainId: number; basescanBase: string }> {
  try {
    const { config } = await import('@/lib/config');
    return {
      chainId: config?.croo?.chainId ?? BASE_CHAIN_ID,
      basescanBase: config?.croo?.basescanBase ?? DEFAULT_BASESCAN_TX_BASE,
    };
  } catch {
    const chainId = Number(process.env.BASE_CHAIN_ID) || BASE_CHAIN_ID;
    return { chainId, basescanBase: process.env.BASESCAN_TX_BASE || DEFAULT_BASESCAN_TX_BASE };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Jittered step delay in the lively 250–700ms band, seeded for reproducibility. */
function stepDelay(rng: () => number): number {
  return 250 + Math.floor(rng() * 450);
}

export class SimCapAdapter implements CapAdapter {
  readonly mode: Mode = 'sim';

  async discover(capabilityTag: string): Promise<Service[]> {
    // Registry guarantees >= 1, external-first. Return the Service views.
    return discoverInRegistry(capabilityTag).map((e) => e.service);
  }

  async hire(input: {
    runId: string;
    orchestrator: Agent;
    service: Service;
    subtask: string;
    emit: (e: JobEvent) => void;
  }): Promise<Job> {
    const { runId, orchestrator, service, subtask, emit } = input;
    const { chainId, basescanBase } = await chainConfig();

    const jobId = nanoid();
    const seed = `${runId}:${jobId}`;
    const rng = seededRng(seed);

    const now = () => Date.now();
    const job: Job = {
      id: jobId,
      subtask,
      requesterAgentId: orchestrator.id,
      providerAgentId: service.agentId,
      serviceId: service.serviceId,
      phase: 'discovered',
      priceUsdc: service.priceUsdc,
      createdAt: now(),
      updatedAt: now(),
    };

    // Announce the job (edge appears).
    emit({ type: 'job.created', runId, job: { ...job }, at: now() });

    // Helper to advance phase + emit.
    const advance = (phase: JobPhase, patch: Partial<Job> = {}) => {
      Object.assign(job, patch, { phase, updatedAt: now() });
      emit({ type: 'job.phase', runId, jobId, phase, job: { ...job }, at: now() });
    };

    // negotiating
    await sleep(stepDelay(rng));
    advance('negotiating', { negotiationId: `neg_${nanoid(10)}` });

    // accepted -> on-chain order created
    await sleep(stepDelay(rng));
    advance('accepted', {
      orderId: `ord_${nanoid(10)}`,
      chainOrderId: String(1000 + Math.floor(rng() * 9000)),
      createTxHash: fakeTxHash(seed + ':create'),
    });

    // funded -> escrow locked, USDC coin travels
    await sleep(stepDelay(rng));
    advance('funded', { payTxHash: fakeTxHash(seed + ':pay') });

    // delivering -> specialist works. Produce the real deliverable here (AI or canned).
    advance('delivering');
    const def = specialistByAgentId(service.agentId);
    let deliverableText: string;
    if (def) {
      deliverableText = await produceDeliverable({ def, subtask });
    } else {
      // External-team service we don't run: fabricate a plausible deliverable via the
      // generalist brain so the briefing still has substance in SIM.
      const gen = specialistByAgentId('agent_general');
      deliverableText = gen
        ? await produceDeliverable({ def: gen, subtask })
        : 'External agent deliverable (illustrative for demo).';
    }
    // Ensure delivering phase reads for a lively beat even if the brain returned instantly.
    await sleep(stepDelay(rng));

    // verified -> deliverable hash stamped ("no proof, no payment")
    const deliverableHash = fakeKeccak(seed + ':' + deliverableText.slice(0, 64));
    advance('verified', {
      deliverableHash,
      deliverableText,
      deliverTxHash: fakeTxHash(seed + ':deliver'),
    });

    // settled -> escrow released, funds land, reputation ticks
    await sleep(stepDelay(rng));
    const clearTxHash = fakeTxHash(seed + ':clear');
    advance('settled', { clearTxHash });

    // Emit the settlement row.
    const settlement: Settlement = {
      id: `stl_${nanoid(10)}`,
      jobId,
      fromAgentId: orchestrator.id,
      toAgentId: service.agentId,
      amountUsdc: service.priceUsdc,
      token: 'USDC',
      chainId,
      payTxHash: job.payTxHash!,
      clearTxHash,
      deliverableHash,
      explorerUrl: explorerTxUrl(clearTxHash, basescanBase),
      at: now(),
    };
    emit({ type: 'settlement', runId, settlement, at: now() });

    // Reputation ticks +1 for the cleared order.
    const entry = entryByServiceId(service.serviceId);
    const newRep = (entry?.agent.reputation ?? service.reputation) + 1;
    emit({
      type: 'reputation.updated',
      runId,
      agentId: service.agentId,
      reputation: newRep,
      delta: 1,
      at: now(),
    });

    return { ...job };
  }
}
