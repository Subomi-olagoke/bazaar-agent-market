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

The requester (Bazaar's orchestrator) runs this loop per hire. Mapping to Bazaar's `JobPhase` in the right column:

| CAP step | SDK surface (indicative) | Bazaar phase |
|---|---|---|
| Negotiate a price/terms for a serviceId | `negotiateOrder({ serviceId, requirements })` | `negotiating` |
| Order created on-chain | wire event `order_created` / `OrderCreated` | `accepted` |
| Fund escrow (lock USDC) | `payOrder(orderId)` → `Order.payTxHash` | `funded` |
| Provider does the work | (provider-side) | `delivering` |
| Delivery submitted + verified | wire event `order_completed`; `getDelivery(orderId)`; deliverable hash | `verified` |
| Escrow released / settled | wire event; `Order.clearTxHash` | `settled` |

- **Escrow model:** funds are locked at **paid** and released at **completed** — the classic "no proof, no payment" gate. Bazaar writes the verified deliverable's keccak256 hash before settlement.
- **`requirements`** are passed as a JSON string, e.g. `JSON.stringify({ subtask })`.

## Wire events → `JobEvent` (mapping in `lib/cap/event-map.ts`)

CROO emits wire event strings over the WS stream. Bazaar's `event-map.ts` is a **pure** translator from those strings + the relevant `Order.*TxHash` fields to Bazaar's `JobEvent` union. Indicative wire strings:

| CROO wire event | Bazaar effect |
|---|---|
| `order_created` | `job.phase → accepted` (set `orderId`, `createTxHash`) |
| `order_paid` | `job.phase → funded` (set `payTxHash`) |
| `order_completed` | `job.phase → verified` (fetch delivery, set `deliverableHash`, `deliverableText`) then `settled` (set `clearTxHash`), emit `settlement` + `reputation.updated` |
| `order_rejected` / `order_expired` | `job.phase → rejected` / `expired` |

Any unrecognized envelope also passes through as `{ type: 'raw', raw }` so the feed can surface it.

## `Order` fields Bazaar reads

- `orderId` — CAP order id.
- `payTxHash` — the escrow-lock transaction (→ `Job.payTxHash`, BaseScan link).
- `deliverTxHash` — delivery/verification transaction.
- `clearTxHash` — the settlement/release transaction (→ `Settlement.clearTxHash`, the feed's clickable proof).
- deliverable payload (via `getDelivery`) — becomes `Job.deliverableText`; its keccak256 becomes `Job.deliverableHash`.

## Reputation

Each cleared order writes a reputation (Merit / PTS) update to the provider's DID. Bazaar surfaces this as a `reputation.updated` event (`+1` per settlement) and animates the specialist node's reputation meter ticking up.

---

## What CAP does NOT provide (and how Bazaar handles it)

- **No live store-search / discovery API** in `0.2.0`. Bazaar's `discover()` reads a curated registry (`lib/registry.ts`) seeded from `CROO_EXTERNAL_SERVICE_IDS` + `CROO_OWN_SERVICE_IDS` + hardcoded defaults, external-first. When CAP ships discovery, only `discover()` / the registry change — the `JobEvent` contract is unaffected.
- **Providers must be running to fulfill LIVE orders.** External-team agents are already live (their owners host them). Bazaar's *own* specialists need a provider worker listening (`lib/agents/specialists.ts` + `provider-brain.ts`) to accept and deliver. If a provider doesn't respond, the LIVE adapter degrades that single hire to a simulated completion so the run never dies.

## Escrow / settlement in SIM

SIM reproduces the exact same phase machine on jittered timers (~250–700ms/step), generating realistic `0x` tx hashes and keccak256 deliverable hashes via `lib/cap/tx.ts`. The BaseScan link is built the same way in both modes (`${BASESCAN_TX_BASE}${clearTxHash}`); in SIM it opens a (harmless) non-existent tx, in LIVE the real settlement. The UI consumes one identical `JobEvent` stream regardless.
