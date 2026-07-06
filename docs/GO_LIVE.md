# Bazaar — Going Live (real USDC on Base)

This is the exact, step-by-step path from the default simulation to **real USDC settling on Base between real registered agents.** Simulation needs nothing; LIVE needs a few minutes of setup at agent.croo.network.

> **Safe-demo reminder:** For the judged run, keep `BAZAAR_FORCE_SIM=true`. Go LIVE for the on-chain-proof shot (a real BaseScan tx) and then flip back. LIVE degrades per-hire to simulation on any error, so even a live run won't dead-end — but SIM is the guaranteed-safe default.

---

## What you need

- A CROO account at **agent.croo.network**.
- 2–3 agents registered (one **orchestrator**, one or more **specialists**).
- Test USDC in each agent's smart-account wallet.
- A few minutes.

You do **not** need ETH — CROO sponsors gas for the AA smart-account wallets.

---

## Step 1 — Register your agents

1. Go to **agent.croo.network** and sign in.
2. Create your **orchestrator** agent (this is the one that hires and pays). Give it a name like `bazaar-orchestrator`.
3. Create one or more **specialist** agents — these are the ones that get hired and paid. For a full briefing demo, create up to four, mapped to Bazaar's capability tags:
   - `market-data` — e.g. `bazaar-market-data`
   - `sentiment` — e.g. `bazaar-sentiment`
   - `risk` — e.g. `bazaar-risk`
   - `chart-read` — e.g. `bazaar-chart-read`
4. For each **specialist**, list a **capability / service** on the CROO Store: give it a name, a price in USDC (start tiny, e.g. `0.05`), an SLA window, and note the **serviceId** the dashboard assigns. You'll need those serviceIds in Step 4.

> Want to hire *other teams'* agents (the real "wow")? Browse the store, grab their public **serviceIds**, and you'll list them as `CROO_EXTERNAL_SERVICE_IDS` in Step 4. Bazaar's discovery prefers external services and falls back to your own.

---

## Step 2 — Copy each agent's SDK-Key

1. In each agent's dashboard page, find its **SDK-Key** (`croo_sk_…`).
2. Copy the **orchestrator's** SDK-Key — that's the one Bazaar authenticates with to hire and pay. Set it as `CROO_SDK_KEY` (Step 4).
3. Keep the specialists' keys handy if you want to run them as live provider workers (see Step 5).

> Treat SDK-Keys like secrets. They go in `.env.local` (git-ignored), never in the client. Bazaar only exposes `/api/config`, which never leaks a key.

---

## Step 3 — Fund each agent's wallet with test USDC

1. Each agent has an **AA smart-account wallet address** on Base (ERC-4337), shown in its dashboard.
2. Deposit **test USDC** to each wallet — the orchestrator needs enough to pay for all the hires in a run (e.g. 4 subtasks × `0.05` = `0.20` USDC plus headroom). Specialists don't need a balance to *receive*.
3. Confirm the balances show up in the dashboard before running.

No ETH needed — gas is sponsored.

---

## Step 4 — Set environment variables

Edit `.env.local` (copy from `.env.example` if you haven't):

```bash
# Flip off the safe simulation default
BAZAAR_FORCE_SIM=false

# The orchestrator's SDK-Key — Bazaar authenticates and pays as this agent
CROO_SDK_KEY=croo_sk_your_orchestrator_key

# CAP endpoints (defaults are correct for mainnet)
CROO_API_URL=https://api.croo.network
CROO_WS_URL=wss://api.croo.network/ws
BASE_RPC_URL=https://mainnet.base.org
BASE_CHAIN_ID=8453
BASESCAN_TX_BASE=https://basescan.org/tx/

# Discovery seeds — external (other teams) preferred, your own as fallback.
# Comma-separated serviceIds. Leave EXTERNAL empty to hire only your own.
CROO_EXTERNAL_SERVICE_IDS=svc_otherteam_a,svc_otherteam_b
CROO_OWN_SERVICE_IDS=svc_your_market_data,svc_your_sentiment,svc_your_risk,svc_your_chart_read

# Optional: real AI copy (canned fallback if omitted)
OPENAI_API_KEY=sk_your_openai_key
```

Notes:
- **LIVE activates only when** `BAZAAR_FORCE_SIM=false` **and** `CROO_SDK_KEY` is set **and** `@croo-network/sdk` imports successfully. If any of those fail, Bazaar silently uses simulation (check the mode badge / `/api/health`).
- If `CROO_EXTERNAL_SERVICE_IDS` is empty, discovery falls back entirely to your own specialists — still a complete demo.

---

## Step 5 — (Optional) Run your own specialists as live providers

External-team agents are hired but run by their owners. **Your own** specialists need a provider worker listening so they can accept orders and deliver. Bazaar defines these in `lib/agents/specialists.ts` + `lib/agents/provider-brain.ts`.

- For the demo, the simplest path is to hire **external** agents (Step 1–4) — they're already running, so you don't need to host anything.
- If you want your own specialists to complete real orders, run a lightweight provider listener for each (using its specialist SDK-Key) so it accepts `negotiateOrder`, does the work via the provider brain, and submits delivery. Consult docs/CAP_NOTES.md for the provider method surface.
- Either way, LIVE degrades a hire to a simulated completion if a provider doesn't respond in time — the run still finishes.

---

## Step 6 — Flip it on and verify

```bash
npm run dev
```

1. Open **http://localhost:3000**. The badge should read **`LIVE · BASE 8453`**.
   - If it still says `SIMULATION`, check `/api/health` — it reports whether the CROO and OpenAI keys were detected (booleans only). Re-check Step 4.
2. Type a task and hit **RUN**.
3. Watch a hire go through `funded` → `verified` → `settled`. When a settlement row lands in the live feed, **click its tx hash** — it opens the real transaction on BaseScan.
4. That BaseScan link is your on-chain proof for the submission. Copy the hash into README's "On-chain proof" section and into docs/SUBMISSION.md.

---

## Flipping back to safe simulation

For the judged run, set:

```bash
BAZAAR_FORCE_SIM=true
```

Restart. The badge reads `SIMULATION`, the same choreography runs deterministically, and nothing can break on stage.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Badge stuck on `SIMULATION` | `BAZAAR_FORCE_SIM=true`, missing key, or SDK didn't import | Set `BAZAAR_FORCE_SIM=false`, confirm `CROO_SDK_KEY`, check `/api/health` |
| Hire hangs then completes anyway | Provider didn't respond in the SLA window | Expected — LIVE degrades that hire to a simulated completion |
| Payment fails | Orchestrator wallet underfunded | Deposit more test USDC (Step 3) |
| Discovery only finds your own agents | `CROO_EXTERNAL_SERVICE_IDS` empty or invalid | Add valid external serviceIds from the store |
| `next build` fails referencing the SDK | Should never happen — SDK is lazy-imported | Confirm you haven't top-level-imported `@croo-network/sdk` anywhere |
