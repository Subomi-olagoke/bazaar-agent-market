// lib/agents/specialists.ts — our OWN provider specialists.
//
// These serve double duty:
//   1. As fallback store listings for discovery (origin: 'own'), guaranteeing the
//      demo never dead-ends when no external team agents are available.
//   2. As the LIVE provider "brains" — each definition carries the systemPrompt the
//      provider-brain uses to fabricate a deliverable for a hired subtask.
//
// A capabilityTag maps a subtask to a specialist. The orchestrator's decompose step
// emits subtasks tagged with one of these tags; discovery filters by tag.

import type { Agent, Service } from '@/lib/types';
import { fakeAddress, fakeDid } from '@/lib/cap/tx';

/** The coarse capability tags the market understands. */
export type CapabilityTag =
  | 'market-data'
  | 'sentiment'
  | 'risk'
  | 'chart-read'
  | 'macro'
  | 'general';

export interface SpecialistDef {
  agentId: string;
  name: string;
  capabilityTag: CapabilityTag;
  /** System prompt driving the provider-brain to produce this specialist's deliverable. */
  systemPrompt: string;
  /** Default price per call in USDC (human units). */
  priceUsdc: number;
  /** SLA window in minutes. */
  slaMinutes: number;
  /** Baseline reputation (PTS) for our own listings. */
  reputation: number;
  deliverableType: 'text' | 'schema';
  /** One-line store description. */
  description: string;
  /** Canned deliverable used when no OPENAI_API_KEY is present. `{subtask}` is not templated;
   *  the provider-brain passes this through verbatim for offline demos. */
  cannedDeliverable: string;
}

/**
 * Our own specialist roster. One per capability tag so discovery always has a fallback.
 * These are intentionally market/trading-flavored to match the briefing use case.
 */
export const SPECIALIST_DEFS: SpecialistDef[] = [
  {
    agentId: 'agent_market_data',
    name: 'Tape & Quote Agent',
    capabilityTag: 'market-data',
    priceUsdc: 0.04,
    slaMinutes: 2,
    reputation: 128,
    deliverableType: 'text',
    description: 'Pulls the current tape: last price, session range, volume vs. average, key levels.',
    systemPrompt: [
      'You are a market-data specialist agent hired inside an autonomous agent market.',
      'Given a subtask, produce a TIGHT factual-style market-data readout: last/prior close,',
      'session range, relative volume, and 2-3 key technical levels. Use plausible round',
      'illustrative numbers (this is a demo, not live market data) and clearly frame them as',
      'illustrative. 4-6 terse bullet-style lines, no preamble, no advice.',
    ].join(' '),
    cannedDeliverable: [
      'Last 118.40, prior close 116.02 (+2.05%). Session range 115.9–119.7 on ~1.4x average volume.',
      'Support 115.5 / 113.0; resistance 120.0 (prior swing high).',
      'Tape is constructive but extended vs. the 20-day. Illustrative figures for demo.',
    ].join(' '),
  },
  {
    agentId: 'agent_sentiment',
    name: 'Semiconductor Sentiment Agent',
    capabilityTag: 'sentiment',
    priceUsdc: 0.05,
    slaMinutes: 3,
    reputation: 96,
    deliverableType: 'text',
    description: 'Scores news + social sentiment for a ticker or sector and surfaces the dominant narrative.',
    systemPrompt: [
      'You are a sentiment specialist agent in an autonomous agent market.',
      'Given a subtask, produce a concise sentiment readout: an overall tilt',
      '(bullish/neutral/bearish) with a rough 0-100 score, the 2 dominant narratives driving it,',
      'and one contrarian flag. Frame as observation, not advice. 4-6 lines, no preamble.',
    ].join(' '),
    cannedDeliverable: [
      'Overall tilt: mildly bullish (score ~64/100).',
      'Dominant narratives: (1) AI-datacenter demand pull-through, (2) supply normalization easing prior shortages.',
      'Contrarian flag: positioning looks crowded; sentiment this one-sided often precedes a shakeout.',
      'Illustrative sentiment for demo.',
    ].join(' '),
  },
  {
    agentId: 'agent_risk',
    name: 'Position Risk Agent',
    capabilityTag: 'risk',
    priceUsdc: 0.06,
    slaMinutes: 3,
    reputation: 141,
    deliverableType: 'text',
    description: 'Frames volatility, event risk, and sensible invalidation levels for the setup.',
    systemPrompt: [
      'You are a risk specialist agent in an autonomous agent market.',
      'Given a subtask, produce a risk framing: implied/realized volatility posture, the next',
      'scheduled event risk, a reasonable invalidation level, and a note on correlation/overlap',
      'risk. Educational framing only, never tell anyone to buy or sell. 4-6 lines, no preamble.',
    ].join(' '),
    cannedDeliverable: [
      'Volatility posture: elevated — implied running above 30-day realized, options priced for a move.',
      'Next event risk: earnings/guidance window within ~2 weeks; gap risk into it.',
      'Invalidation to watch: a close back below the prior breakout (~113) weakens the thesis.',
      'Correlation note: heavy overlap with the broad semi complex — not an independent bet. Illustrative for demo.',
    ].join(' '),
  },
  {
    agentId: 'agent_chart_read',
    name: 'Chart-Read Agent',
    capabilityTag: 'chart-read',
    priceUsdc: 0.05,
    slaMinutes: 2,
    reputation: 88,
    deliverableType: 'text',
    description: 'Reads the multi-timeframe structure: trend, key patterns, and the levels that matter.',
    systemPrompt: [
      'You are a technical chart-reading specialist agent in an autonomous agent market.',
      'Given a subtask, describe the structure across daily/weekly: primary trend, one notable',
      'pattern, moving-average posture, and the single most important level. Observation only.',
      '4-6 lines, no preamble, no advice.',
    ].join(' '),
    cannedDeliverable: [
      'Primary trend: up on the daily, price extended above a rising 20-day.',
      'Pattern: bull flag resolved higher; measured move points toward the 122 area.',
      'MA posture: 20 > 50 > 200, textbook alignment.',
      'Level that matters most: the 115.5 flag base — losing it neutralizes the setup. Illustrative for demo.',
    ].join(' '),
  },
  {
    agentId: 'agent_macro',
    name: 'Macro Context Agent',
    capabilityTag: 'macro',
    priceUsdc: 0.05,
    slaMinutes: 4,
    reputation: 110,
    deliverableType: 'text',
    description: 'Sets the macro backdrop: rates, liquidity, and the sector rotation regime.',
    systemPrompt: [
      'You are a macro-context specialist agent in an autonomous agent market.',
      'Given a subtask, sketch the macro backdrop relevant to the ticker/sector: rates/liquidity',
      'regime, risk appetite, and where the sector sits in the rotation. Observation only.',
      '4-6 lines, no preamble, no advice.',
    ].join(' '),
    cannedDeliverable: [
      'Rates/liquidity: policy on hold, real yields stable — a supportive-but-not-easy backdrop for duration-like growth names.',
      'Risk appetite: constructive; breadth improving off the lows.',
      'Rotation: semis remain a leadership group; momentum still favors the complex.',
      'Illustrative macro framing for demo.',
    ].join(' '),
  },
  {
    agentId: 'agent_general',
    name: 'Generalist Research Agent',
    capabilityTag: 'general',
    priceUsdc: 0.03,
    slaMinutes: 2,
    reputation: 72,
    deliverableType: 'text',
    description: 'Catch-all research agent for subtasks that do not map to a named specialist.',
    systemPrompt: [
      'You are a generalist research specialist agent in an autonomous agent market.',
      'Given any subtask, produce a compact, useful research note grounded in general knowledge.',
      'Observation and context only, never financial advice. 4-6 lines, no preamble.',
    ].join(' '),
    cannedDeliverable: [
      'Compact research note: the subtask maps to a broad-context question; the relevant drivers',
      'are demand trend, competitive positioning, and the near-term catalyst calendar.',
      'No single factor dominates — weigh them together. Illustrative research for demo.',
    ].join(' '),
  },
];

/** Fast lookup by tag. */
export const SPECIALIST_BY_TAG: Record<CapabilityTag, SpecialistDef> = SPECIALIST_DEFS.reduce(
  (acc, d) => {
    acc[d.capabilityTag] = d;
    return acc;
  },
  {} as Record<CapabilityTag, SpecialistDef>,
);

/** Lookup a def by agentId. */
export function specialistByAgentId(agentId: string): SpecialistDef | undefined {
  return SPECIALIST_DEFS.find((d) => d.agentId === agentId);
}

/** Build an Agent record for one of our own specialists. */
export function ownAgentFromDef(def: SpecialistDef): Agent {
  return {
    id: def.agentId,
    name: def.name,
    role: 'specialist',
    origin: 'own',
    did: fakeDid(def.agentId),
    walletAddress: fakeAddress(def.agentId),
    reputation: def.reputation,
    avatarSeed: def.agentId,
  };
}

/** Build a synthetic own Service listing for one of our own specialists. */
export function ownServiceFromDef(def: SpecialistDef, serviceId?: string): Service {
  return {
    serviceId: serviceId ?? `svc_own_${def.agentId}`,
    agentId: def.agentId,
    name: def.name,
    description: def.description,
    priceUsdc: def.priceUsdc,
    slaMinutes: def.slaMinutes,
    reputation: def.reputation,
    origin: 'own',
    deliverableType: def.deliverableType,
    capabilityTag: def.capabilityTag,
  };
}
