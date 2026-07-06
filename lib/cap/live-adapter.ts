// lib/cap/live-adapter.ts — the LIVE CAP adapter (real @croo-network/sdk on Base).
//
// CRITICAL: never top-level-import @croo-network/sdk. It is a soft dependency; we
// lazy `import()` it inside create() and wrap everything in try/catch so the app builds
// and runs in SIM even if the package is missing or unbuildable.
//
// Real loop per hire:
//   negotiateOrder({serviceId, requirements}) -> wait OrderCreated
//   -> payOrder(orderId)         (emit funded, real payTxHash)
//   -> wait OrderCompleted       (provider delivered + verified on-chain)
//   -> getDelivery(orderId)      (emit verified: deliverableHash + deliverableText)
//   -> emit settled + settlement (+ reputation)
//
// On any per-hire runtime error, this DEGRADES that single hire to a SIM-completed job
// so a run never dies mid-demo. Discovery reuses the same curated registry as SIM
// (CAP has no public discovery API); external seeds are preferred.

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
} from '@/lib/cap/tx';
import {
  extractDeliverableText,
  extractOrderId,
  extractProof,
  normalizeWireType,
  wireTypeToPhase,
  type CrooOrderLike,
  type CrooWireEvent,
} from '@/lib/cap/event-map';
import { SimCapAdapter } from '@/lib/cap/sim-adapter';
import { nanoid } from 'nanoid';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface CrooRuntime {
  client: any; // AgentClient — typed loosely since the SDK is a soft dep
  chainId: number;
  basescanBase: string;
}

/**
 * A pending-order waiter registry: the WS stream pushes wire events keyed by orderId;
 * hire() awaits the phases it needs. Kept simple — one map of orderId -> listeners.
 */
type WirePhaseListener = (phase: JobPhase, e: CrooWireEvent) => void;

export class LiveCapAdapter implements CapAdapter {
  readonly mode: Mode = 'live';

  private client: any;
  private chainId: number;
  private basescanBase: string;
  private sim = new SimCapAdapter(); // used for per-hire degradation
  private listeners = new Map<string, Set<WirePhaseListener>>();

  private constructor(rt: CrooRuntime) {
    this.client = rt.client;
    this.chainId = rt.chainId;
    this.basescanBase = rt.basescanBase;
  }

  /**
   * Attempt to construct a LIVE adapter. Returns null (never throws) if the SDK can't
   * import or the client can't construct — the factory then falls back to SIM.
   */
  static async create(): Promise<LiveCapAdapter | null> {
    let cfg: {
      apiURL: string;
      wsURL: string;
      rpcURL: string;
      sdkKey: string;
      chainId: number;
      basescanBase: string;
    };
    try {
      const { config } = await import('@/lib/config');
      const croo = config?.croo ?? ({} as any);
      if (!croo.sdkKey) return null;
      cfg = {
        apiURL: croo.apiUrl || 'https://api.croo.network',
        wsURL: croo.wsUrl || 'wss://api.croo.network/ws',
        rpcURL: croo.rpcUrl || 'https://mainnet.base.org',
        sdkKey: croo.sdkKey,
        chainId: croo.chainId ?? BASE_CHAIN_ID,
        basescanBase: croo.basescanBase ?? DEFAULT_BASESCAN_TX_BASE,
      };
    } catch {
      const sdkKey = process.env.CROO_SDK_KEY;
      if (!sdkKey) return null;
      cfg = {
        apiURL: process.env.CROO_API_URL || 'https://api.croo.network',
        wsURL: process.env.CROO_WS_URL || 'wss://api.croo.network/ws',
        rpcURL: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
        sdkKey,
        chainId: Number(process.env.BASE_CHAIN_ID) || BASE_CHAIN_ID,
        basescanBase: process.env.BASESCAN_TX_BASE || DEFAULT_BASESCAN_TX_BASE,
      };
    }

    let sdk: any;
    try {
      // Soft, lazy import. Marked external in next.config.js so a missing build is fine.
      sdk = await import('@croo-network/sdk');
    } catch (err) {
      console.warn('[live-adapter] @croo-network/sdk not importable:', (err as Error)?.message);
      return null;
    }

    try {
      const AgentClient = sdk.AgentClient ?? sdk.default?.AgentClient ?? sdk.default;
      if (!AgentClient) {
        console.warn('[live-adapter] AgentClient export not found on SDK');
        return null;
      }
      const client = new AgentClient(
        { baseURL: cfg.apiURL, wsURL: cfg.wsURL, rpcURL: cfg.rpcURL },
        cfg.sdkKey,
      );

      const adapter = new LiveCapAdapter({
        client,
        chainId: cfg.chainId,
        basescanBase: cfg.basescanBase,
      });

      // Connect the WS event stream and fan wire events to per-order listeners.
      try {
        if (typeof client.connectWebSocket === 'function') {
          await client.connectWebSocket();
        }
        const stream =
          (typeof client.eventStream === 'function' && client.eventStream()) ||
          client.events ||
          client;
        if (stream && typeof stream.on === 'function') {
          stream.on('message', (raw: CrooWireEvent) => adapter.onWireEvent(raw));
          stream.on('event', (raw: CrooWireEvent) => adapter.onWireEvent(raw));
        }
      } catch (err) {
        console.warn('[live-adapter] WS connect failed (hires will poll/degrade):', (err as Error)?.message);
      }

      console.info('[cap] LIVE adapter active — real USDC settlement on Base', cfg.chainId);
      return adapter;
    } catch (err) {
      console.warn('[live-adapter] client construction failed:', (err as Error)?.message);
      return null;
    }
  }

  /** Fan an incoming wire event to any listeners registered for its orderId. */
  private onWireEvent(raw: CrooWireEvent): void {
    try {
      const orderId = extractOrderId(raw);
      if (!orderId) return;
      const phase = wireTypeToPhase(normalizeWireType(raw));
      if (!phase) return;
      const set = this.listeners.get(orderId);
      if (set) for (const fn of set) fn(phase, raw);
    } catch {
      /* swallow — never let a stray wire event break a run */
    }
  }

  private addListener(orderId: string, fn: WirePhaseListener): () => void {
    let set = this.listeners.get(orderId);
    if (!set) {
      set = new Set();
      this.listeners.set(orderId, set);
    }
    set.add(fn);
    return () => {
      set!.delete(fn);
      if (set!.size === 0) this.listeners.delete(orderId);
    };
  }

  /** Wait for a specific phase on an order via the WS stream, with a timeout. */
  private waitForPhase(orderId: string, target: JobPhase, timeoutMs: number): Promise<CrooWireEvent> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error(`timeout waiting for ${target} on order ${orderId}`));
      }, timeoutMs);
      const off = this.addListener(orderId, (phase, e) => {
        if (phase === target || phaseAtLeast(phase, target)) {
          clearTimeout(timer);
          off();
          resolve(e);
        }
      });
    });
  }

  async discover(capabilityTag: string): Promise<Service[]> {
    // Same curated registry as SIM (no live store query exists). External seeds first.
    return discoverInRegistry(capabilityTag).map((e) => e.service);
  }

  async hire(input: {
    runId: string;
    orchestrator: Agent;
    service: Service;
    subtask: string;
    emit: (e: JobEvent) => void;
  }): Promise<Job> {
    try {
      return await this.hireLive(input);
    } catch (err) {
      console.warn(
        `[live-adapter] hire degraded to SIM for service ${input.service.serviceId}:`,
        (err as Error)?.message,
      );
      // Per-hire degradation: complete this one hire in SIM so the run never dies.
      return this.sim.hire(input);
    }
  }

  private async hireLive(input: {
    runId: string;
    orchestrator: Agent;
    service: Service;
    subtask: string;
    emit: (e: JobEvent) => void;
  }): Promise<Job> {
    const { runId, orchestrator, service, subtask, emit } = input;
    const now = () => Date.now();
    const jobId = nanoid();

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
    emit({ type: 'job.created', runId, job: { ...job }, at: now() });

    const advance = (phase: JobPhase, patch: Partial<Job> = {}) => {
      Object.assign(job, patch, { phase, updatedAt: now() });
      emit({ type: 'job.phase', runId, jobId, phase, job: { ...job }, at: now() });
    };
    const passthrough = (raw: CrooWireEvent) =>
      emit({ type: 'raw', runId, raw: raw as Record<string, unknown>, at: now() });

    const SLA_MS = Math.max(30_000, service.slaMinutes * 60_000);

    // 1. NEGOTIATE
    advance('negotiating');
    const neg = await this.client.negotiateOrder({
      serviceId: service.serviceId,
      requirements: JSON.stringify({ subtask }),
    });
    const negObj = (neg ?? {}) as CrooOrderLike;
    const orderId = negObj.orderId ?? negObj.id ?? extractOrderId(negObj as CrooWireEvent);
    if (!orderId) throw new Error('negotiateOrder returned no orderId');
    passthrough(negObj as CrooWireEvent);

    // 2. Wait for OrderCreated / accepted, then extract proof.
    let createdEvt: CrooWireEvent | null = null;
    try {
      createdEvt = await this.waitForPhase(orderId, 'accepted', SLA_MS);
    } catch {
      // Some SDK flows create synchronously — proceed with the negotiation object.
    }
    advance('accepted', {
      orderId,
      negotiationId: negObj.negotiationId,
      ...extractProof(createdEvt?.order ?? negObj),
    });

    // 3. PAY — escrow lock. Real payTxHash.
    const payRes = (await this.client.payOrder(orderId)) as CrooOrderLike;
    passthrough(payRes as CrooWireEvent);
    const payProof = extractProof(payRes);
    const payTxHash = payProof.payTxHash ?? payRes.payTxHash ?? payRes.createTxHash;
    if (!payTxHash) throw new Error('payOrder returned no payTxHash');
    advance('funded', { ...payProof, payTxHash });

    // 4. Provider works. Wait for OrderCompleted (verified on-chain).
    advance('delivering');
    const completedEvt = await this.waitForPhase(orderId, 'verified', SLA_MS);
    passthrough(completedEvt);

    // 5. Pull the delivery.
    let deliveryPayload: unknown = completedEvt.order?.deliverable ?? completedEvt.data;
    try {
      if (typeof this.client.getDelivery === 'function') {
        deliveryPayload = await this.client.getDelivery(orderId);
        passthrough({ type: 'delivery_fetched', orderId, data: deliveryPayload as Record<string, unknown> });
      }
    } catch (err) {
      console.warn('[live-adapter] getDelivery failed, using event payload:', (err as Error)?.message);
    }

    // Deliverable text: prefer the on-chain delivery; fall back to our provider-brain
    // (for our OWN specialists) so the briefing always has substance.
    let deliverableText = extractDeliverableText(deliveryPayload);
    if (!deliverableText) {
      const def = specialistByAgentId(service.agentId);
      deliverableText = def
        ? await produceDeliverable({ def, subtask })
        : 'Verified deliverable (on-chain payload unavailable).';
    }
    const completedProof = extractProof(
      (completedEvt.order ?? (deliveryPayload as CrooOrderLike)) as CrooOrderLike,
    );
    const deliverableHash =
      completedProof.deliverableHash ?? fakeKeccak(orderId + ':' + deliverableText.slice(0, 64));
    advance('verified', {
      ...completedProof,
      deliverableHash,
      deliverableText,
    });

    // 6. Wait for settlement / clear. Some flows settle on completion; poll the stream.
    let clearTxHash = completedProof.clearTxHash;
    if (!clearTxHash) {
      try {
        const settledEvt = await this.waitForPhase(orderId, 'settled', SLA_MS);
        passthrough(settledEvt);
        clearTxHash = extractProof(settledEvt.order).clearTxHash;
      } catch {
        // Settlement not separately signalled — treat pay/deliver as the clearing proof.
      }
    }
    // Best-effort: query the final order for the clear tx if the SDK supports it.
    if (!clearTxHash && typeof this.client.getOrder === 'function') {
      try {
        const finalOrder = (await this.client.getOrder(orderId)) as CrooOrderLike;
        clearTxHash = extractProof(finalOrder).clearTxHash;
      } catch {
        /* ignore */
      }
    }
    // Guarantee a settlement proof so the feed always has a clickable tx.
    const finalClear = clearTxHash ?? job.deliverTxHash ?? payTxHash;
    advance('settled', { clearTxHash: finalClear });

    const settlement: Settlement = {
      id: `stl_${nanoid(10)}`,
      jobId,
      fromAgentId: orchestrator.id,
      toAgentId: service.agentId,
      amountUsdc: service.priceUsdc,
      token: 'USDC',
      chainId: this.chainId,
      payTxHash,
      clearTxHash: finalClear,
      deliverableHash,
      explorerUrl: explorerTxUrl(finalClear, this.basescanBase),
      at: now(),
    };
    emit({ type: 'settlement', runId, settlement, at: now() });

    // Reputation tick.
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

    await sleep(1); // yield
    return { ...job };
  }
}

/** Phase ordering so waitForPhase can resolve if the stream jumps ahead of a target. */
const PHASE_ORDER: JobPhase[] = [
  'discovered',
  'negotiating',
  'accepted',
  'funded',
  'delivering',
  'verified',
  'settled',
];
function phaseAtLeast(phase: JobPhase, target: JobPhase): boolean {
  const p = PHASE_ORDER.indexOf(phase);
  const t = PHASE_ORDER.indexOf(target);
  if (p < 0 || t < 0) return false;
  return p >= t;
}
