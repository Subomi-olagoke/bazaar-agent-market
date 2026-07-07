// lib/cap/event-map.ts — pure mapping from CROO wire events → Bazaar JobPhase / fields.
//
// Imported only by live-adapter.ts. Kept pure + dependency-free so the mapping is
// trivially auditable and testable. CROO's wire event strings and Order tx-hash fields
// are documented in docs/CAP_NOTES.md; the escrow model is paid -> completed -> cleared.

import type { JobPhase } from '@/lib/types';

/**
 * Real CROO wire event type strings (verified against @croo-network/sdk EventType).
 * The SDK ONLY emits these — there is no order_accepted/settled/cleared/verified.
 * `order_completed` is the terminal success signal (delivered + verified + settled).
 */
export type CrooWireEventType =
  | 'order_negotiation_created'
  | 'order_negotiation_rejected'
  | 'order_negotiation_expired'
  | 'order_created'
  | 'order_paid'
  | 'order_completed'
  | 'order_rejected'
  | 'order_expired'
  | string; // tolerate unknown strings

/**
 * A minimal shape of a real CROO `Order` (subset we consume). Field names verified
 * against @croo-network/sdk 0.2.1 (node_modules/@croo-network/sdk/dist/types.d.ts) —
 * there is no `settleTxHash` or `deliverableHash` on Order; the deliverable hash lives
 * on `Delivery.contentHash` instead.
 */
export interface CrooOrderLike {
  orderId?: string;
  id?: string;
  chainOrderId?: string | number;
  negotiationId?: string;
  status?: string;
  createTxHash?: string;
  payTxHash?: string;
  deliverTxHash?: string;
  clearTxHash?: string;
  deliverable?: unknown;
  [k: string]: unknown;
}

/** A CROO wire envelope from the event stream. */
export interface CrooWireEvent {
  type?: CrooWireEventType;
  event?: CrooWireEventType; // some SDKs use `event`
  orderId?: string;
  order?: CrooOrderLike;
  data?: Record<string, unknown>;
  [k: string]: unknown;
}

/** Map a CROO wire event type string → a Bazaar JobPhase (or null if not phase-bearing). */
export function wireTypeToPhase(type: CrooWireEventType | undefined): JobPhase | null {
  switch (type) {
    case 'order_negotiation_created':
      return 'negotiating';
    // Provider accepted the negotiation → the on-chain order now exists.
    case 'order_created':
      return 'accepted';
    // Requester funded escrow.
    case 'order_paid':
      return 'funded';
    // Terminal success: provider delivered, delivery verified, escrow released.
    // The adapter expands this into verified → settled for the viz.
    case 'order_completed':
      return 'settled';
    case 'order_rejected':
    case 'order_negotiation_rejected':
      return 'rejected';
    case 'order_expired':
    case 'order_negotiation_expired':
      return 'expired';
    default:
      return null;
  }
}

/** Extract the normalized event type from either `type` or `event` field. */
export function normalizeWireType(e: CrooWireEvent): CrooWireEventType | undefined {
  return (e.type ?? e.event) as CrooWireEventType | undefined;
}

/** Pull the order id out of a wire event. Real events use snake_case `order_id`. */
export function extractOrderId(e: CrooWireEvent): string | undefined {
  const snake = (e as Record<string, unknown>).order_id ?? e.data?.order_id;
  return (
    (typeof snake === 'string' ? snake : undefined) ??
    e.orderId ??
    e.order?.orderId ??
    e.order?.id ??
    (typeof e.data?.orderId === 'string' ? (e.data.orderId as string) : undefined)
  );
}

/** Pull the negotiation id out of a wire event. Real events use `negotiation_id`. */
export function extractNegotiationId(e: CrooWireEvent): string | undefined {
  const rec = e as Record<string, unknown>;
  const candidates: unknown[] = [
    rec.negotiation_id,
    e.data?.negotiation_id,
    rec.negotiationId,
    e.order?.negotiationId,
    e.data?.negotiationId,
  ];
  for (const c of candidates) if (typeof c === 'string' && c) return c;
  return undefined;
}

/**
 * Extract the on-chain proof fields carried by a real `Order` into a partial Job patch.
 * Only defined fields are returned so we never clobber earlier values.
 */
export function extractProof(order: CrooOrderLike | undefined): {
  chainOrderId?: string;
  createTxHash?: string;
  payTxHash?: string;
  deliverTxHash?: string;
  clearTxHash?: string;
} {
  if (!order) return {};
  const out: Record<string, string> = {};
  if (order.chainOrderId != null) out.chainOrderId = String(order.chainOrderId);
  if (order.createTxHash) out.createTxHash = order.createTxHash;
  if (order.payTxHash) out.payTxHash = order.payTxHash;
  if (order.deliverTxHash) out.deliverTxHash = order.deliverTxHash;
  if (order.clearTxHash) out.clearTxHash = order.clearTxHash;
  return out;
}

/**
 * Pull deliverable text out of a `Delivery` payload — real field is `deliverableText` —
 * or, best-effort, out of any other payload shape we might be handed.
 */
export function extractDeliverableText(payload: unknown): string | undefined {
  if (payload == null) return undefined;
  if (typeof payload === 'string') return payload;
  if (typeof payload === 'object') {
    const o = payload as Record<string, unknown>;
    for (const k of ['deliverableText', 'text', 'deliverable', 'content', 'result', 'output', 'data']) {
      const v = o[k];
      if (typeof v === 'string' && v.trim()) return v;
    }
    try {
      return JSON.stringify(payload);
    } catch {
      return undefined;
    }
  }
  return String(payload);
}
