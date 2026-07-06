// lib/config.ts — Lane C
// Central typed config, derived from lib/env.ts. Mirrors Edge's lib/config.ts shape.
// Server-only. The ONLY thing safe to hand to the client is `publicConfig()`
// (returns a PublicConfig with no secrets).

import type { Mode, PublicConfig } from '@/lib/types';
import { env } from '@/lib/env';

/**
 * Resolve the *intended* mode from env alone (does not attempt the SDK import —
 * that final gate lives in Lane A's `getCapAdapter()`). `mode === 'live'` iff
 * BAZAAR_FORCE_SIM is off AND a CROO_SDK_KEY is present. `getCapAdapter()` may
 * still downgrade to 'sim' at runtime if the SDK fails to import/construct.
 */
function resolveMode(): Mode {
  if (env.BAZAAR_FORCE_SIM) return 'sim';
  if (env.CROO_SDK_KEY && env.CROO_SDK_KEY.trim().length > 0) return 'live';
  return 'sim';
}

/** Curated example tasks surfaced as one-click chips in the TaskConsole. */
export const EXAMPLE_TASKS: string[] = [
  'Give me a pre-market briefing on NVDA and the semiconductor tape.',
  'Brief me on the crude oil complex and energy equities into the open.',
  'What should I know about the US 10-year and rate-sensitive sectors today?',
];

export const config = {
  /** Intended runtime mode (env-derived; runtime may downgrade to sim). */
  mode: resolveMode(),

  appName: env.NEXT_PUBLIC_APP_NAME,

  openai: {
    apiKey: env.OPENAI_API_KEY,
    /** True when an OpenAI key is present; brains use canned output otherwise. */
    enabled: env.OPENAI_API_KEY.trim().length > 0,
    model: env.OPENAI_MODEL,
    miniModel: env.OPENAI_MINI_MODEL,
  },

  croo: {
    apiUrl: env.CROO_API_URL,
    wsUrl: env.CROO_WS_URL,
    sdkKey: env.CROO_SDK_KEY,
    /** True when a CROO key is present AND sim isn't forced. Lane A gates further. */
    enabled: !env.BAZAAR_FORCE_SIM && env.CROO_SDK_KEY.trim().length > 0,
    rpcUrl: env.BASE_RPC_URL,
    chainId: env.BASE_CHAIN_ID,
    basescanBase: env.BASESCAN_TX_BASE,
    /** External (other-team) serviceIds — preferred in discovery for the "wow". */
    externalServiceIds: env.CROO_EXTERNAL_SERVICE_IDS,
    /** Our own listed specialist serviceIds — the graceful fallback set. */
    ownServiceIds: env.CROO_OWN_SERVICE_IDS,
  },

  exampleTasks: EXAMPLE_TASKS,
} as const;

export type Config = typeof config;

/** The secret-free config surface for the client, served by /api/config. */
export function publicConfig(): PublicConfig {
  return {
    mode: config.mode,
    chainId: config.croo.chainId,
    basescanBase: config.croo.basescanBase,
    exampleTasks: config.exampleTasks,
  };
}
