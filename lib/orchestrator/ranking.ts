// lib/orchestrator/ranking.ts — pure, deterministic service ranking.
//
// Ranks candidate services for a subtask by reputation (higher better), price (cheaper
// better), and SLA (faster better), with a small tiebreak bonus toward EXTERNAL origin
// (real strangers transacting = the "wow"). No side effects; unit-testable.

import type { Service } from '@/lib/types';

export interface RankWeights {
  reputation: number;
  price: number;
  sla: number;
  originBonus: number;
}

/** Spec weights: reputation 0.5, price 0.3, sla 0.2, small external tiebreak. */
export const DEFAULT_WEIGHTS: RankWeights = {
  reputation: 0.5,
  price: 0.3,
  sla: 0.2,
  originBonus: 0.05,
};

/** Min-max normalize a value into [0,1] given the candidate set's range. */
function normalize(value: number, min: number, max: number): number {
  if (max <= min) return 0.5; // degenerate range → neutral
  return (value - min) / (max - min);
}

/** Score one service against the candidate-set ranges. Higher = better. */
export function scoreService(
  service: Service,
  ranges: { rep: [number, number]; price: [number, number]; sla: [number, number] },
  weights: RankWeights = DEFAULT_WEIGHTS,
): number {
  const repN = normalize(service.reputation, ranges.rep[0], ranges.rep[1]);
  const priceN = normalize(service.priceUsdc, ranges.price[0], ranges.price[1]);
  const slaN = normalize(service.slaMinutes, ranges.sla[0], ranges.sla[1]);
  const originBonus = service.origin === 'external' ? weights.originBonus : 0;

  // reputation up, price down, sla down.
  return (
    weights.reputation * repN -
    weights.price * priceN -
    weights.sla * slaN +
    originBonus
  );
}

/**
 * Rank candidates best-first. Deterministic: ties broken by external > own, then lower
 * price, then serviceId (stable). Returns a new sorted array; empty in → empty out.
 */
export function rank(candidates: Service[], weights: RankWeights = DEFAULT_WEIGHTS): Service[] {
  if (candidates.length === 0) return [];
  if (candidates.length === 1) return [...candidates];

  const reps = candidates.map((c) => c.reputation);
  const prices = candidates.map((c) => c.priceUsdc);
  const slas = candidates.map((c) => c.slaMinutes);
  const ranges = {
    rep: [Math.min(...reps), Math.max(...reps)] as [number, number],
    price: [Math.min(...prices), Math.max(...prices)] as [number, number],
    sla: [Math.min(...slas), Math.max(...slas)] as [number, number],
  };

  const scored = candidates.map((c) => ({ c, s: scoreService(c, ranges, weights) }));
  scored.sort((a, b) => {
    if (b.s !== a.s) return b.s - a.s;
    // tiebreak: external first
    if (a.c.origin !== b.c.origin) return a.c.origin === 'external' ? -1 : 1;
    // then cheaper
    if (a.c.priceUsdc !== b.c.priceUsdc) return a.c.priceUsdc - b.c.priceUsdc;
    // then stable by serviceId
    return a.c.serviceId.localeCompare(b.c.serviceId);
  });
  return scored.map((x) => x.c);
}

/** Convenience: the single best candidate, or undefined if none. */
export function best(candidates: Service[], weights: RankWeights = DEFAULT_WEIGHTS): Service | undefined {
  return rank(candidates, weights)[0];
}
