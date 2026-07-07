// lib/cap/adapter.ts — the CAP seam. Every module talks to CROO only through this.

import type { Agent, JobEvent, Mode, Service } from '@/lib/types';

/**
 * The single interface every other module codes against. Two implementations:
 *  - SimCapAdapter (lib/cap/sim-adapter.ts): lively deterministic fake economy.
 *  - LiveCapAdapter (lib/cap/live-adapter.ts): real @croo-network/sdk on Base.
 * The UI cannot tell them apart — both emit the same JobEvent stream.
 */
export interface CapAdapter {
  mode: Mode;

  /**
   * Discovery is Bazaar-side (CAP has no public discovery API). Returns candidate
   * services for a coarse capability tag, external origins first, our own
   * specialists as guaranteed fallback. Never resolves empty.
   */
  discover(capabilityTag: string): Promise<Service[]>;

  /**
   * Run one hire end-to-end, emitting phase events + the final settlement via `emit`.
   * Resolves with the completed Job (deliverableText populated) or throws.
   */
  hire(input: {
    runId: string;
    orchestrator: Agent;
    service: Service;
    subtask: string;
    emit: (e: JobEvent) => void;
  }): Promise<import('@/lib/types').Job>;
}

// Cache the resolved adapter for the process lifetime so we only probe the SDK once.
let cached: CapAdapter | null = null;
let cachedPromise: Promise<CapAdapter> | null = null;

/**
 * Synchronous accessor used by the orchestrator. Returns the SIM adapter immediately
 * and kicks off async LIVE resolution in the background; the async `resolveCapAdapter`
 * is the authoritative path when LIVE is desired.
 *
 * The orchestrator awaits `resolveCapAdapter()` first (see orchestrator.ts), so by the
 * time `getCapAdapter()` matters the cache is populated. This dual API keeps callers
 * that cannot await (rare) from crashing.
 */
export function getCapAdapter(): CapAdapter {
  if (cached) return cached;
  // Not yet resolved — return a SIM adapter synchronously; safe default.
  // Relative require so the bundler resolves it reliably at runtime (avoids alias-in-require).
  const { SimCapAdapter } = require('./sim-adapter') as typeof import('@/lib/cap/sim-adapter');
  cached = new SimCapAdapter();
  return cached;
}

/**
 * Authoritative factory. Returns LIVE only if a CROO SDK key is present AND the SDK
 * imports AND the client constructs; otherwise SIM. Any failure logs once and falls
 * back to SIM so a run never dies on setup.
 */
export async function resolveCapAdapter(): Promise<CapAdapter> {
  if (cached) return cached;
  if (cachedPromise) return cachedPromise;

  cachedPromise = (async (): Promise<CapAdapter> => {
    const { SimCapAdapter } = await import('@/lib/cap/sim-adapter');

    // Resolve mode via config. Import lazily so a config import error still yields SIM.
    let wantLive = false;
    try {
      const { config } = await import('@/lib/config');
      wantLive = config?.mode === 'live' && !!config?.croo?.sdkKey;
    } catch {
      wantLive = false;
    }

    if (!wantLive) {
      cached = new SimCapAdapter();
      return cached;
    }

    try {
      const { LiveCapAdapter } = await import('@/lib/cap/live-adapter');
      const live = await LiveCapAdapter.create();
      if (live) {
        cached = live;
        return cached;
      }
    } catch (err) {
      console.warn('[cap] LIVE adapter unavailable, falling back to SIM:', (err as Error)?.message);
    }

    cached = new SimCapAdapter();
    return cached;
  })();

  return cachedPromise;
}

/** Test/dev helper: clear the cached adapter (e.g. after env changes). */
export function _resetCapAdapter(): void {
  cached = null;
  cachedPromise = null;
}
