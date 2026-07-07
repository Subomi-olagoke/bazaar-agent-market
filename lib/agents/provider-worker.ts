// lib/agents/provider-worker.ts — a standalone PROVIDER loop for one of Bazaar's own
// specialist agents on the real CROO network.
//
// Bazaar's Next.js app (lib/cap/live-adapter.ts) only ever plays REQUESTER — it hires
// specialists, it never accepts negotiations. For a real settlement to happen at all,
// SOMEONE has to be running as the PROVIDER on the other end of the trade: listening
// for `NegotiationCreated`, calling `acceptNegotiation`, then on `OrderPaid` producing
// a deliverable and calling `deliverOrder`. Serverless Next.js can't hold a long-lived
// WebSocket connection open, so this runs as its own long-lived Node process (see
// scripts/run-provider-worker.ts) — one of our own agents, registered separately on the
// CROO dashboard with its own SDK key, seeded into CROO_OWN_SERVICE_IDS.
//
// Deliberately dependency-free w.r.t. Next.js (no `@/` aliases, no lib/config) so it
// can run outside the Next bundler via a plain Node/tsx process.

import { produceDeliverable } from './provider-brain';
import type { SpecialistDef } from './specialists';

export interface ProviderWorkerOptions {
  apiUrl: string;
  wsUrl: string;
  sdkKey: string;
  /** Which specialist "brain" this provider agent embodies (drives deliverable content). */
  specialistDef: SpecialistDef;
  logger?: Pick<Console, 'log' | 'warn' | 'error'>;
}

/** Stop function returned by runProviderWorker(); closes the WS connection. */
export type StopProviderWorker = () => void;

/**
 * Start listening as a PROVIDER. Never throws after the initial connect — a single
 * order's failure (bad requirements, delivery error) is caught and logged so the
 * process keeps listening for the next negotiation.
 */
export async function runProviderWorker(opts: ProviderWorkerOptions): Promise<StopProviderWorker> {
  const { apiUrl, wsUrl, sdkKey, specialistDef, logger = console } = opts;

  // Lazy import mirrors live-adapter.ts's soft-dependency pattern.
  const sdk = await import('@croo-network/sdk');
  const { AgentClient, EventType, DeliverableType } = sdk;

  const client = new AgentClient({ baseURL: apiUrl, wsURL: wsUrl }, sdkKey);
  const stream = await client.connectWebSocket();

  const tag = `provider-worker:${specialistDef.agentId}`;

  stream.on(EventType.NegotiationCreated, async (e: { negotiation_id?: string }) => {
    const negotiationId = e.negotiation_id;
    if (!negotiationId) return;
    try {
      const result = await client.acceptNegotiation(negotiationId);
      logger.log(`[${tag}] accepted negotiation ${negotiationId} -> order ${result.order.orderId}`);
    } catch (err) {
      logger.warn(`[${tag}] accept failed for negotiation ${negotiationId}:`, (err as Error)?.message);
    }
  });

  stream.on(EventType.OrderPaid, async (e: { order_id?: string }) => {
    const orderId = e.order_id;
    if (!orderId) return;
    try {
      const subtask = await recoverSubtask(client, orderId);
      const deliverableText = await produceDeliverable({ def: specialistDef, subtask });
      await client.deliverOrder(orderId, {
        deliverableType: DeliverableType.Text,
        deliverableText,
      });
      logger.log(`[${tag}] delivered order ${orderId}`);
    } catch (err) {
      logger.warn(`[${tag}] deliver failed for order ${orderId}:`, (err as Error)?.message);
    }
  });

  stream.on(EventType.NegotiationExpired, (e: { negotiation_id?: string }) => {
    logger.warn(`[${tag}] negotiation expired`, e.negotiation_id);
  });
  stream.on(EventType.OrderExpired, (e: { order_id?: string }) => {
    logger.warn(`[${tag}] order expired`, e.order_id);
  });
  stream.on(EventType.OrderRejected, (e: { order_id?: string; reason?: string }) => {
    logger.warn(`[${tag}] order rejected`, e.order_id, e.reason);
  });

  logger.log(`[${tag}] listening for negotiations on ${wsUrl}...`);
  return () => stream.close();
}

/** Best-effort: recover the requester's original subtask text via the order's negotiation. */
async function recoverSubtask(client: any, orderId: string): Promise<string> {
  const fallback = 'General research subtask (requirements unavailable — order paid without echoed context).';
  try {
    const order = await client.getOrder(orderId);
    if (!order?.negotiationId) return fallback;
    const negotiation = await client.getNegotiation(order.negotiationId);
    if (!negotiation?.requirements) return fallback;
    const parsed = JSON.parse(negotiation.requirements);
    return typeof parsed?.subtask === 'string' && parsed.subtask.trim() ? parsed.subtask : fallback;
  } catch {
    return fallback;
  }
}
