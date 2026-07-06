// app/api/health/route.ts — Lane C
// GET liveness + key-presence booleans for demo/deploy sanity checks.
// Returns ONLY booleans about key presence — never the keys themselves.

import { config } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const payload = {
    ok: true,
    mode: config.mode,
    chainId: config.croo.chainId,
    keys: {
      openai: config.openai.enabled,
      croo: config.croo.enabled,
    },
    registrySeeds: {
      external: config.croo.externalServiceIds.length,
      own: config.croo.ownServiceIds.length,
    },
    at: Date.now(),
  };
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
