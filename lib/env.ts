// lib/env.ts — Lane C
// Zod-validated env loader with simulation-safe defaults.
// Every field has a `.default(...)` so `next build`/`next dev` NEVER throws for a
// missing var. This module reads `process.env` once and exports the parsed object.
// It is server-only (imports secrets); never import this from a client component.

import { z } from 'zod';

/** Coerce common truthy string forms into a boolean. Undefined/empty → fallback. */
function boolFromEnv(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase());
}

/** Split a comma-separated env list into a trimmed, non-empty string array. */
function listFromEnv(v: string | undefined): string[] {
  if (!v) return [];
  return v
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const EnvSchema = z.object({
  // ── MODE ──
  // BAZAAR_FORCE_SIM defaults to `true` so a judged run never accidentally hits a
  // live failure. Opt into LIVE explicitly by setting it false AND providing a key.
  BAZAAR_FORCE_SIM: z.boolean().default(true),

  // ── OPENAI ──
  OPENAI_API_KEY: z.string().default(''),
  OPENAI_MODEL: z.string().default('gpt-4o'),
  OPENAI_MINI_MODEL: z.string().default('gpt-4o-mini'),

  // ── CROO CAP (LIVE only) ──
  CROO_API_URL: z.string().default('https://api.croo.network'),
  CROO_WS_URL: z.string().default('wss://api.croo.network/ws'),
  CROO_SDK_KEY: z.string().default(''),
  BASE_RPC_URL: z.string().default('https://mainnet.base.org'),
  BASE_CHAIN_ID: z.coerce.number().int().default(8453),
  BASESCAN_TX_BASE: z.string().default('https://basescan.org/tx/'),

  // ── DISCOVERY REGISTRY SEEDS ──
  CROO_EXTERNAL_SERVICE_IDS: z.array(z.string()).default([]),
  CROO_OWN_SERVICE_IDS: z.array(z.string()).default([]),

  // ── UI / DEMO ──
  NEXT_PUBLIC_APP_NAME: z.string().default('Bazaar'),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Parse process.env into a typed, defaulted Env object. Coerces bool/list fields
 * before validation. Uses `safeParse` so this can never throw at import time — on
 * the (near-impossible) parse failure we fall back to the all-defaults object.
 */
function loadEnv(): Env {
  const raw = {
    BAZAAR_FORCE_SIM: boolFromEnv(process.env.BAZAAR_FORCE_SIM, true),

    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    OPENAI_MINI_MODEL: process.env.OPENAI_MINI_MODEL,

    CROO_API_URL: process.env.CROO_API_URL,
    CROO_WS_URL: process.env.CROO_WS_URL,
    CROO_SDK_KEY: process.env.CROO_SDK_KEY,
    BASE_RPC_URL: process.env.BASE_RPC_URL,
    BASE_CHAIN_ID: process.env.BASE_CHAIN_ID,
    BASESCAN_TX_BASE: process.env.BASESCAN_TX_BASE,

    CROO_EXTERNAL_SERVICE_IDS: listFromEnv(process.env.CROO_EXTERNAL_SERVICE_IDS),
    CROO_OWN_SERVICE_IDS: listFromEnv(process.env.CROO_OWN_SERVICE_IDS),

    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  };

  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    // Should be unreachable given every field defaults; log once, use all-defaults.
    console.warn('[bazaar/env] env parse fell back to defaults:', parsed.error.message);
    return EnvSchema.parse({});
  }
  return parsed.data;
}

/** The single parsed env, evaluated once at module load. */
export const env: Env = loadEnv();
