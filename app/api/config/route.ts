// app/api/config/route.ts — Lane C
// GET public runtime flags for the UI. Returns a PublicConfig (Section 4) and
// NEVER leaks a secret — only mode, chainId, basescan base, and example tasks.

import type { PublicConfig } from '@/lib/types';
import { publicConfig } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const cfg: PublicConfig = publicConfig();
  return new Response(JSON.stringify(cfg), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
