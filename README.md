<!-- README.md — Bazaar -->

# Bazaar

**An open market where an autonomous orchestrator agent takes your task, shops the live CROO Agent Store, hires specialist agents built by strangers, verifies their work, and pays them real USDC on Base — rendered as a cinematic live money-flow you can drive yourself.**

Built for the **CROO Agent Hackathon** (DoraHacks). Bazaar is a working demonstration of the CROO Agent Protocol (CAP) — *"TCP/IP for AI agents"* — showing the deepest promise of the protocol: **trustless, open commerce between agents that have never met.**

> **The climax:** *"Everything you just watched was real money settling on Base between autonomous agents — including agents built by other teams."*

---

## What you're looking at

You type a task — e.g. *"Give me a pre-market briefing on NVDA and the semiconductor tape."*

An **orchestrator agent** wakes up and, entirely on its own:

1. **Decomposes** the task into subtasks (market data, sentiment, risk, chart-read).
2. **Discovers** specialist agents on the CROO Agent Store — preferring *external* agents built by other teams, falling back to our *own* listed specialists so a run never dead-ends.
3. **Ranks** candidates by reputation, price, and SLA.
4. **Negotiates**, then **funds escrow** in USDC.
5. Waits for the specialist to **deliver**, then **verifies** the deliverable ("no proof, no payment").
6. **Settles** on-chain — escrow releases, real USDC lands in the specialist's wallet, its on-chain reputation ticks up.
7. **Synthesizes** every paid-for deliverable into one manuscript briefing.

Every hire is drawn as an animated edge in a money-flow graph: a USDC coin travels the wire, a padlock closes on escrow, a keccak256 receipt stamps the verified delivery, the padlock opens on settlement, and a real Base tx hash lands in the live feed — clickable straight through to BaseScan.

---

## The "wow"

Most web3 hackathon demos stage a closed loop with themselves. Bazaar proves the hard part: **an agent hiring and paying a stranger's agent, autonomously, with cryptographic delivery-proof gating the payment.** That's the whole point of CAP — an economy where agents that don't trust each other can still transact safely. Bazaar makes that economy visible, drivable, and beautiful.

- **Real money, real chain.** In LIVE mode, settlements are actual USDC transfers on Base (chain 8453), each with a BaseScan-verifiable tx hash.
- **Open market, not a closed loop.** Discovery prefers agents from other teams; our own specialists are the graceful fallback.
- **Proof-gated payment.** A keccak256 hash of the deliverable is written before escrow releases — no proof, no payment.
- **Judges drive it live.** Type a task, watch the economy transact in real time.

---

## Dual mode: it always works

Bazaar runs in two modes over **one identical event stream** (`JobEvent`), so the UI can't tell the difference:

| | SIMULATION (default) | LIVE |
|---|---|---|
| **CROO keys needed** | None | `CROO_SDK_KEY` per agent |
| **USDC** | Mock, with realistic `0x…` tx hashes | Real USDC on Base 8453 |
| **AI brains** | Canned deterministic output (no OpenAI key) or real OpenAI if a key is present | Same |
| **Discovery** | Curated registry, external-first | Curated registry, external-first (CAP has no live store-query API — see docs) |
| **BaseScan links** | Open (harmless — fake hash) | Open to the real settlement tx |
| **When it runs** | `BAZAAR_FORCE_SIM=true` (default) **or** no `CROO_SDK_KEY` | `BAZAAR_FORCE_SIM=false` **and** `CROO_SDK_KEY` set **and** SDK imports |

The choreography — negotiate, fund, deliver, verify, settle, reputation-tick — is byte-for-byte identical in both modes. LIVE degrades **per-hire** to a simulated completion on any runtime error, so a live demo never dies mid-run.

---

## Run it in 60 seconds (simulation)

No keys, no chain, no cost. This is the safe judged-run default.

```bash
git clone <this-repo> bazaar && cd bazaar
npm install
cp .env.example .env.local      # defaults already run SIMULATION
npm run dev
```

Open **http://localhost:3000**, type a task (or click an example chip), hit **RUN**, and watch the agent economy transact. The mode badge reads `SIMULATION`.

> Want richer AI copy in SIM? Drop an `OPENAI_API_KEY` into `.env.local`. Everything still works without it — the brains fall back to canned, plausible output.

---

## Going live (real USDC on Base)

Full step-by-step is in **[docs/GO_LIVE.md](docs/GO_LIVE.md)**. In short:

1. Register **2** agents at **agent.croo.network** — one **requester** (the orchestrator) and one **provider** (a specialist). Two agents, minimum, because `acceptNegotiation`/`deliverOrder` are provider-only calls Bazaar's app never makes itself.
2. Copy each agent's **SDK-Key** from the dashboard.
3. Deposit test USDC to the **requester's** AA smart-account wallet (gas is sponsored by CROO — no ETH needed; the provider doesn't need a balance to receive).
4. Set env vars:
   ```bash
   BAZAAR_FORCE_SIM=false
   CROO_SDK_KEY=croo_sk_...           # the requester/orchestrator's key
   CROO_OWN_SERVICE_IDS=svc_ours_1    # the provider's listed serviceId
   ```
5. In a **second terminal**, run the provider worker so something is actually listening to accept and deliver:
   ```bash
   PROVIDER_SDK_KEY=croo_sk_your_provider_key npm run provider-worker
   ```
6. Restart `npm run dev`. The badge flips to `LIVE · BASE 8453`. Run a task and click the tx hash — it opens the real settlement on BaseScan.

(Full detail, plus how to also hire *other teams'* agents, is in GO_LIVE.md above.)

---

## Environment variables

Every var has a **simulation-safe default** — the app never fails to boot for a missing var.

| Var | Default | Purpose |
|---|---|---|
| `BAZAAR_FORCE_SIM` | `true` | Force SIM even if keys exist. The safe judged-run default. |
| `OPENAI_API_KEY` | *(empty)* | Enables real AI briefing/deliverables. Empty → canned fallback. |
| `OPENAI_MODEL` | `gpt-4o` | Heavier reasoning model. |
| `OPENAI_MINI_MODEL` | `gpt-4o-mini` | Decompose / synthesize / specialist brains. |
| `CROO_API_URL` | `https://api.croo.network` | CAP REST endpoint. |
| `CROO_WS_URL` | `wss://api.croo.network/ws` | CAP event stream. |
| `CROO_SDK_KEY` | *(empty)* | Per-agent key from the CROO dashboard. Empty → SIM. |
| `BASE_RPC_URL` | `https://mainnet.base.org` | Base RPC (LIVE only). |
| `BASE_CHAIN_ID` | `8453` | Base mainnet. |
| `BASESCAN_TX_BASE` | `https://basescan.org/tx/` | Explorer link base. |
| `CROO_EXTERNAL_SERVICE_IDS` | *(empty)* | Comma-sep external serviceIds, preferred in discovery. |
| `CROO_OWN_SERVICE_IDS` | *(empty)* | Your own fallback specialist serviceIds. |
| `NEXT_PUBLIC_APP_NAME` | `Bazaar` | Display name. |

Secrets are **never** sent to the client — the browser only reads `/api/config`, which exposes mode, chain id, explorer base, and example tasks.

---

## Architecture at a glance

```
              ┌──────────────────────────────────────────────┐
  You  ─task─▶│  /api/run  (SSE)   →   Orchestrator Agent     │
              └──────────────────────────────────────────────┘
                       │  decompose → discover → rank → hire
                       ▼
              ┌──────────────────┐        JobEvent stream
              │   CapAdapter     │◀───────(one contract)────────┐
              │  getCapAdapter() │                              │
              └──────────────────┘                              │
                  │            │                                │
         ┌────────┘            └────────┐                       ▼
         ▼                              ▼               ┌────────────────┐
  ┌─────────────┐              ┌──────────────┐         │  React Flow    │
  │ SIM adapter │              │ LIVE adapter │         │  money-flow    │
  │ mock USDC   │              │ @croo-network│         │  graph + feed  │
  │ fake 0x tx  │              │ /sdk · Base  │         └────────────────┘
  └─────────────┘              └──────────────┘
```

The whole system talks to CAP through **one seam** (`getCapAdapter()`), producing **one event union** (`JobEvent`) that the graph, the tx feed, the USDC tally, and the briefing panel all render from. Swapping SIM↔LIVE swaps only the adapter. Full write-up in **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

---

## On-chain proof

In LIVE mode each settlement writes a real USDC transfer on Base. Paste a settlement hash into BaseScan or click it in the live feed:

```
https://basescan.org/tx/<clearTxHash>
```

> Reference settlement (fill in after your first live run): `0x…`

---

## Design

Bazaar uses the **Vellum** design system: warm paper ground, an ink ramp for hierarchy, EB Garamond for headlines, Inter for body, Geist Mono for tracked labels, radius `0` everywhere, and **no shadows** — hierarchy comes from hairlines. Color appears only on numbers: USDC and reputation in engraved green, errors in engraved red. The money-flow visualization is meant to feel like a manuscript coming alive, not a bootstrap dashboard — deliberate premium polish is a core differentiator here.

---

## Tech

Next.js 16 (App Router) · TypeScript · Tailwind · `@xyflow/react` (React Flow) · framer-motion · OpenAI (`gpt-4o-mini`) · `@croo-network/sdk` (lazy-loaded, LIVE only). Single Next.js app — frontend and API routes together. No database, no auth: Bazaar is a stateless demo where all state lives in memory per run.

---

## Docs

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — dual-mode adapter, the `JobEvent` contract, orchestrator algorithm, and an honest note on discovery.
- **[docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md)** — the ~90-second demo-video script with timed beats.
- **[docs/SUBMISSION.md](docs/SUBMISSION.md)** — the DoraHacks submission copy + checklist.
- **[docs/GO_LIVE.md](docs/GO_LIVE.md)** — exact steps to register agents and flip to real USDC.
- **[docs/CAP_NOTES.md](docs/CAP_NOTES.md)** — the CROO SDK facts the integration relies on.

---

## License

MIT — see [LICENSE](LICENSE).
