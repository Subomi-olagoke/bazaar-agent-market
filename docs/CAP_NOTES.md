# CAP Integration Notes

Distilled CROO Agent Protocol (CAP) facts the LIVE adapter relies on, so reviewers and teammates can trust the integration. This documents the surface Bazaar codes against; the authoritative source is docs.croo.network and github.com/CROO-Network/node-sdk.

---

## SDK

- **Package:** `@croo-network/sdk` (`^0.2.0`). TypeScript/Node primary; python/go also exist.
- **Loading rule in Bazaar:** never top-level-imported. It is lazy `import()`-ed **only** inside `lib/cap/live-adapter.ts`, wrapped in try/catch. `next.config.js` marks it external so `next build` succeeds even if the package is missing or unbuildable. This is what lets SIM run with zero CROO dependency.

## Client construction

```ts
const { AgentClient } = await import('@croo-network/sdk');
const client = new AgentClient(
  { baseURL: CROO_API_URL, wsURL: CROO_WS_URL, rpcURL: BASE_RPC_URL },
  CROO_SDK_KEY,
);
await client.connectWebSocket();   // one event stream per adapter
```

If the import, construction, or WS connection fails, the adapter logs once and Bazaar falls back to SIM.

## Environment

| Var | Meaning |
|---|---|
| `CROO_API_URL` | `https://api.croo.network` — REST endpoint |
| `CROO_WS_URL` | `wss://api.croo.network/ws` — event stream |
| `CROO_SDK_KEY` | Per-agent key (`croo_sk_…`) from the dashboard; Bazaar authenticates as the orchestrator |
| `CROO_TARGET_SERVICE_ID` | The serviceId a requester wants to hire (Bazaar seeds these via the registry) |
| `BASE_RPC_URL` / `BASE_CHAIN_ID` | Base mainnet RPC + chain id `8453` |

Agents are registered and funded at **agent.croo.network**. Each agent gets a DID (ERC-8004) + an AA smart-account wallet (ERC-4337). **Gas is sponsored by CROO** — no ETH required.

---

## The order lifecycle (what Bazaar drives)

**Verified directly against the installed package** (`node_modules/@croo-network/sdk/dist/*.d.ts`, v0.2.1) — not guessed from docs, since getting this wrong is exactly what silently broke LIVE mode the first time around. Two facts that are easy to get wrong and matter a lot:

1. **`negotiateOrder()` returns a `Negotiation`, which has NO `orderId` field.** The real order doesn't exist yet — it's created only once the provider accepts. The requester must wait for it (via WS `order_created` and/or polling `listOrders`/`getNegotiation`), keyed by `negotiationId`, not `orderId`.
2. **`acceptNegotiation()` is a PROVIDER-only verb.** The requester (Bazaar's orchestrator) never calls it. Whoever owns the *other* agent — another team, or our own `lib/agents/provider-worker.ts` process using a second registered agent's key — must call it. Same for `deliverOrder()`.

The requester (Bazaar's orchestrator, `lib/cap/live-adapter.ts`) runs this loop per hire:

| CAP step | Who calls it | SDK surface | Bazaar phase |
|---|---|---|---|
| Negotiate a price/terms for a serviceId | requester | `negotiateOrder({ serviceId, requirements })` → `{ negotiationId }` | `negotiating` |
| Accept the negotiation → order created on-chain | **provider** (not us) | `acceptNegotiation(negotiationId)`; we learn the `orderId` via wire event `order_created` or by polling | `accepted` |
| Fund escrow (lock USDC) | requester | `payOrder(orderId)` → `PayOrderResult.txHash` | `funded` |
| Do the work, submit delivery | **provider** (not us) | `deliverOrder(orderId, { deliverableType, deliverableText })` | `delivering` |
| Delivery verified, escrow released | — (system) | wire event `order_completed`; `getDelivery(orderId)` → `Delivery.deliverableText` / `Delivery.contentHash` | `verified` → `settled` |

- **Escrow model:** funds are locked at **paid** and released at **completed** — the classic "no proof, no payment" gate. Bazaar reads the deliverable's real `contentHash` (falls back to a computed keccak only if the field is absent).
- **`requirements`** are passed as a JSON string, e.g. `JSON.stringify({ subtask })` — the provider worker parses it back out via `getNegotiation(order.negotiationId).requirements` to recover the original subtask.
- **Resilience:** `live-adapter.ts` races the WS event stream against polling (`getNegotiation`/`listOrders`/`getOrder` every 2.5s) for both waits, since a single WS connection is too fragile to trust exclusively during a live demo.

## Wire events → `JobEvent` (mapping in `lib/cap/event-map.ts`)

CROO emits wire event strings over the WS stream. Bazaar's `event-map.ts` is a **pure** translator from those strings + the relevant `Order.*TxHash` fields to Bazaar's `JobEvent` union. Indicative wire strings:

| CROO wire event | Bazaar effect |
|---|---|
| `order_created` | `job.phase → accepted` (set `orderId`, `createTxHash`) |
| `order_paid` | `job.phase → funded` (set `payTxHash`) |
| `order_completed` | `job.phase → verified` (fetch delivery, set `deliverableHash`, `deliverableText`) then `settled` (set `clearTxHash`), emit `settlement` + `reputation.updated` |
| `order_rejected` / `order_expired` | `job.phase → rejected` / `expired` |

Any unrecognized envelope also passes through as `{ type: 'raw', raw }` so the feed can surface it.

## `Order` / `Delivery` fields Bazaar reads

`Order` (real fields only — no `deliverableHash` or `settleTxHash`, those were earlier guesses and have been removed from `event-map.ts`):
- `orderId`, `negotiationId`, `chainOrderId` — CAP identifiers.
- `createTxHash` / `payTxHash` / `deliverTxHash` / `clearTxHash` — the tx hashes at each stage; `clearTxHash` is the settlement/release tx (→ `Settlement.clearTxHash`, the feed's clickable proof).

`Delivery` (via `getDelivery(orderId)`):
- `deliverableText` — becomes `Job.deliverableText`.
- `contentHash` — the real on-chain deliverable hash, becomes `Job.deliverableHash` (only falls back to a locally-computed keccak if absent).

## Reputation

Each cleared order writes a reputation (Merit / PTS) update to the provider's DID. Bazaar surfaces this as a `reputation.updated` event (`+1` per settlement) and animates the specialist node's reputation meter ticking up.

---

## What CAP does NOT provide (and how Bazaar handles it)

- **No live store-search / discovery API** in `0.2.0`. Bazaar's `discover()` reads a curated registry (`lib/registry.ts`) seeded from `CROO_EXTERNAL_SERVICE_IDS` + `CROO_OWN_SERVICE_IDS` + hardcoded defaults, external-first. When CAP ships discovery, only `discover()` / the registry change — the `JobEvent` contract is unaffected.
- **Providers must be running to fulfill LIVE orders.** External-team agents are already live (their owners host them). Bazaar's *own* specialists need `scripts/run-provider-worker.ts` (→ `lib/agents/provider-worker.ts`) running as a separate long-lived process, authenticated as a *second* registered agent, to accept negotiations and deliver — see docs/GO_LIVE.md Step 5. If no provider responds, the LIVE adapter degrades that single hire to a simulated completion so the run never dies.

## Escrow / settlement in SIM

SIM reproduces the exact same phase machine on jittered timers (~250–700ms/step), generating realistic `0x` tx hashes and keccak256 deliverable hashes via `lib/cap/tx.ts`. The BaseScan link is built the same way in both modes (`${BASESCAN_TX_BASE}${clearTxHash}`); in SIM it opens a (harmless) non-existent tx, in LIVE the real settlement. The UI consumes one identical `JobEvent` stream regardless.
