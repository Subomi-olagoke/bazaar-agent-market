// scripts/run-provider-worker.ts — CLI entrypoint for lib/agents/provider-worker.ts.
//
// Run this in ITS OWN terminal (or small always-on box) during judging, pointed at a
// SECOND CROO agent you registered specifically to be the provider — Bazaar's web app
// authenticates as the REQUESTER (CROO_SDK_KEY) and can never accept its own
// negotiations. Without this process running, any hire against your own serviceId will
// negotiate and then simply hang until it times out and degrades to SIM.
//
// Usage:
//   PROVIDER_SDK_KEY=croo_sk_... PROVIDER_AGENT_ID=agent_market_data npm run provider-worker
//
// PROVIDER_AGENT_ID selects which of lib/agents/specialists.ts's SPECIALIST_DEFS this
// process embodies (just picks the system prompt / canned deliverable) — defaults to
// the first one. See docs/GO_LIVE.md for full setup.

import { runProviderWorker } from '../lib/agents/provider-worker';
import { specialistByAgentId, SPECIALIST_DEFS } from '../lib/agents/specialists';

async function main() {
  const sdkKey = process.env.PROVIDER_SDK_KEY;
  if (!sdkKey) {
    console.error(
      '[run-provider-worker] Set PROVIDER_SDK_KEY to the registered PROVIDER agent\'s SDK key ' +
        '(croo_sk_... from the CROO dashboard — a DIFFERENT agent than CROO_SDK_KEY).',
    );
    process.exit(1);
  }

  const agentId = process.env.PROVIDER_AGENT_ID || SPECIALIST_DEFS[0].agentId;
  const def = specialistByAgentId(agentId);
  if (!def) {
    console.error(
      `[run-provider-worker] Unknown PROVIDER_AGENT_ID "${agentId}". Options: ` +
        SPECIALIST_DEFS.map((d) => d.agentId).join(', '),
    );
    process.exit(1);
  }

  const apiUrl = process.env.CROO_API_URL || 'https://api.croo.network';
  const wsUrl = process.env.CROO_WS_URL || 'wss://api.croo.network/ws';

  const stop = await runProviderWorker({ apiUrl, wsUrl, sdkKey, specialistDef: def });

  process.on('SIGINT', () => {
    stop();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[run-provider-worker] fatal:', err);
  process.exit(1);
});
