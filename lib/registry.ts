// lib/registry.ts — the curated "store" registry powering discovery.
//
// Discovery is Bazaar-side: CAP has no public discovery API, so we curate a registry
// of candidate services. External (other-team) serviceIds are seeded from env and are
// PREFERRED in ranking for the "wow" (real strangers transacting). Our own specialists
// are always present as a guaranteed fallback, so discover() is never empty.
//
// External seeds come as env-provided serviceIds. We fabricate a plausible external
// Agent + Service wrapper for each so the graph can render them as EXTERNAL nodes.
// In LIVE mode the hire targets the real seeded serviceId on-chain.

import type { Agent, Service } from '@/lib/types';
import {
  SPECIALIST_DEFS,
  SPECIALIST_BY_TAG,
  ownAgentFromDef,
  ownServiceFromDef,
  type CapabilityTag,
} from '@/lib/agents/specialists';
import { fakeAddress, fakeDid, seededRng } from '@/lib/cap/tx';

/** A registry entry pairs a listed Service with its provider Agent. */
export interface RegistryEntry {
  service: Service;
  agent: Agent;
}

// Display names + tags we assign to external (other-team) seeded services so they read
// as real market participants. Cycled deterministically per seed order.
const EXTERNAL_NAME_POOL: { name: string; tag: CapabilityTag }[] = [
  { name: 'Helios Market Feed', tag: 'market-data' },
  { name: 'Oracle Sentiment Net', tag: 'sentiment' },
  { name: 'Sentinel Risk Desk', tag: 'risk' },
  { name: 'Cartographer Chart AI', tag: 'chart-read' },
  { name: 'Atlas Macro Agent', tag: 'macro' },
  { name: 'Vega Research Collective', tag: 'general' },
];

/** Parse a comma-separated env list into trimmed non-empty ids. */
function parseIds(csv: string | undefined | null): string[] {
  if (!csv) return [];
  return csv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Build an external RegistryEntry from a seeded serviceId. The serviceId is real (used
 * for LIVE hires); the surrounding display metadata is fabricated so it renders nicely.
 * We derive a plausible tag + price from the seed so ranking behaves.
 */
function externalEntryFromSeed(serviceId: string, index: number): RegistryEntry {
  const rng = seededRng('ext:' + serviceId);
  const pool = EXTERNAL_NAME_POOL[index % EXTERNAL_NAME_POOL.length];
  const agentId = `ext_${serviceId.slice(0, 10)}_${index}`;
  // External agents are competitive: slightly cheaper or higher-rep to win ranking sometimes.
  const priceUsdc = Math.round((0.03 + rng() * 0.05) * 100) / 100;
  const reputation = 80 + Math.floor(rng() * 140);
  const slaMinutes = 1 + Math.floor(rng() * 4);

  const agent: Agent = {
    id: agentId,
    name: pool.name,
    role: 'specialist',
    origin: 'external',
    did: fakeDid(serviceId),
    walletAddress: fakeAddress(serviceId),
    reputation,
    avatarSeed: serviceId,
  };

  const service: Service = {
    serviceId,
    agentId,
    name: pool.name,
    description: `External team capability (${pool.tag}) discovered on the CROO Agent Store.`,
    priceUsdc,
    slaMinutes,
    reputation,
    origin: 'external',
    deliverableType: 'text',
    capabilityTag: pool.tag,
  };

  return { service, agent };
}

/** In-memory registry, built once from env seeds + our own specialist defs. */
let REGISTRY: RegistryEntry[] | null = null;

/**
 * Build (and memoize) the full registry: external seeds first, our own specialists as
 * fallback. Reads env seed csvs directly (SIM-safe: empty seeds → own-only registry).
 */
export function getRegistry(): RegistryEntry[] {
  if (REGISTRY) return REGISTRY;

  const entries: RegistryEntry[] = [];

  // External seeds (preferred). Read straight from env — SIM-safe when empty.
  const externalIds = parseIds(process.env.CROO_EXTERNAL_SERVICE_IDS);
  externalIds.forEach((id, i) => entries.push(externalEntryFromSeed(id, i)));

  // Own specialists (guaranteed fallback). Optional own serviceId seeds map by order.
  const ownServiceIds = parseIds(process.env.CROO_OWN_SERVICE_IDS);
  SPECIALIST_DEFS.forEach((def, i) => {
    const seededId = ownServiceIds[i];
    entries.push({
      agent: ownAgentFromDef(def),
      service: ownServiceFromDef(def, seededId),
    });
  });

  REGISTRY = entries;
  return REGISTRY;
}

/**
 * Discover candidate services for a coarse capability tag. External origins first, our
 * own specialist for the tag guaranteed last. Never returns empty — if nothing matches
 * the tag exactly we still return the own generalist so the demo never dead-ends.
 */
export function discoverInRegistry(capabilityTag: string): RegistryEntry[] {
  const reg = getRegistry();
  const tag = capabilityTag as CapabilityTag;

  const matches = reg.filter((e) => e.service.capabilityTag === tag);
  // Order: external matches first, then own matches.
  matches.sort((a, b) => {
    if (a.service.origin === b.service.origin) return 0;
    return a.service.origin === 'external' ? -1 : 1;
  });

  if (matches.length > 0) return matches;

  // No match for this tag anywhere — fall back to our own specialist for the tag,
  // then to the generalist. Guarantees >= 1.
  const ownDef = SPECIALIST_BY_TAG[tag] ?? SPECIALIST_BY_TAG.general;
  return [
    {
      agent: ownAgentFromDef(ownDef),
      service: ownServiceFromDef(ownDef),
    },
  ];
}

/** Look up a registry entry by serviceId (used by adapters to resolve a hire target). */
export function entryByServiceId(serviceId: string): RegistryEntry | undefined {
  return getRegistry().find((e) => e.service.serviceId === serviceId);
}

/** Test/dev helper: rebuild the registry (e.g. after env changes). */
export function _resetRegistry(): void {
  REGISTRY = null;
}
