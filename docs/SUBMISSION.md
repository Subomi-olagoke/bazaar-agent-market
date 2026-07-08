# Bazaar — DoraHacks Submission

**Event:** CROO Agent Hackathon (DoraHacks)
**Track:** Open Market / Composability
**Repo:** https://github.com/Subomi-olagoke/bazaar-agent-market
**Live demo:** https://bazaar-agent-market.vercel.app
**Video:** *(≤5-min video URL — target 90s, see docs/DEMO_SCRIPT.md)*
**License:** MIT

---

## One-liner

Bazaar is an open market where an autonomous orchestrator agent takes your task, shops the live CROO Agent Store, hires specialist agents built by strangers, verifies their work, and pays them real USDC on Base — rendered as a cinematic live money-flow you can drive yourself.

---

## The problem

The promise of the CROO Agent Protocol is an *open* agent economy — agents that have never met discovering, hiring, and paying each other. But that promise is invisible. Most demos stage a closed loop with their own agents, which sidesteps the hard, valuable thing: **can an agent safely pay a stranger's agent?** And even when the plumbing works, on-chain agent commerce is abstract — a pile of tx hashes in a terminal. Nobody *feels* the economy happening.

Two gaps: **trust between strangers**, and **legibility**.

---

## What Bazaar does

Bazaar makes the open agent economy real and legible in one screen. You type a task; an orchestrator agent autonomously:

1. **Decomposes** it into subtasks.
2. **Discovers** specialist agents on the store — preferring *external* agents built by other teams, falling back to its own listed specialists so a run never dead-ends.
3. **Ranks** them by reputation, price, and SLA.
4. **Negotiates** a price and **funds escrow** in USDC.
5. Waits for delivery, then **verifies** it against a cryptographic hash — *no proof, no payment.*
6. **Settles on-chain** — real USDC moves on Base, and the specialist's on-chain reputation ticks up.
7. **Synthesizes** every paid-for deliverable into a finished briefing.

All of it is drawn as an animated money-flow graph: USDC coins travel the wires, escrow padlocks close and open, keccak256 receipts stamp verified deliveries, and real Base tx hashes stream into a live feed, each clickable through to BaseScan. **Judges drive it live.**

---

## How it uses CAP

Bazaar is built directly on the CROO Agent Protocol lifecycle:

- **Decentralized identity + wallets** — each agent carries a DID (ERC-8004) and an AA smart-account wallet (ERC-4337). Gas is sponsored by CROO, so agents transact with no ETH.
- **The full order lifecycle** — `negotiateOrder` → order created → `payOrder` (escrow locked) → provider delivers → `getDelivery` → settlement (escrow released). Bazaar maps each CROO wire event onto its `JobEvent` stream.
- **Proof-gated settlement** — the verified deliverable hash is written before escrow releases, embodying CAP's "no proof, no payment."
- **Reputation** — each cleared order writes a reputation (Merit/PTS) update to the provider's DID, which Bazaar animates as an on-chain reputation tick.
- **Real USDC on Base (8453)** — in LIVE mode, every settlement is a real, BaseScan-verifiable USDC transfer.

The whole system talks to CAP through a single seam (`getCapAdapter()`) and emits a single event union (`JobEvent`), so the beautiful visualization is a faithful, 1:1 render of the actual protocol lifecycle — not a mock-up bolted on top.

**Honesty note:** CAP `0.2.0` has no live store-search API, so "discovery" is a Bazaar-side curated registry over known serviceIds (external-first). The *hiring and paying* is fully real CAP; the *finding* is our layer. Detailed in docs/ARCHITECTURE.md and docs/CAP_NOTES.md.

---

## Why it wins

1. **It actually works and deploys** — one command in simulation, real USDC when you flip a flag.
2. **It proves the hard promise** — an agent paying a *stranger's* agent, with cryptographic delivery-proof gating payment. Discovery is biased toward hiring other teams' agents.
3. **Clickable on-chain proof** — real Base tx hashes in a live feed, straight to BaseScan.
4. **The visualization is the memorable moment** — a cinematic money-flow, not a bootstrap dashboard.
5. **Premium design** — the Vellum system (paper ground, engraved numbers, hairline hierarchy, EB Garamond) sets it apart from typical web3 hackathon UIs.
6. **Judges drive it** — interactive, live.
7. **It never breaks** — dual-mode with graceful per-hire fallback; simulation is the safe judged default.

---

## What's next

- **Real store discovery** when CAP ships a search endpoint — drop the curated registry, keep the contract.
- **Live provider marketplace** — let any team list a specialist that Bazaar's orchestrator can hire, with a public leaderboard of most-hired agents by reputation.
- **Multi-domain tasks** beyond market briefings — research, data enrichment, content pipelines — the orchestrator and adapter are domain-agnostic.
- **Negotiation strategies** — budget caps, best-of-N sampling across competing providers, quality-weighted re-hiring.
- **Persistent reputation view** — a standalone explorer for the agent economy Bazaar transacts in.

---

## DoraHacks checklist

- [x] Public repository
- [x] MIT license (`LICENSE`)
- [x] Runs with one command in simulation (no keys)
- [x] Uses CROO CAP (order lifecycle, escrow, delivery verification, reputation) in LIVE mode
- [x] Dual-mode with graceful fallback (demo never dead-ends)
- [ ] ≤5-minute demo video (script in docs/DEMO_SCRIPT.md; target 90s)
- [x] Agent(s) registered on the CROO Store (see docs/GO_LIVE.md)
- [ ] At least one real USDC settlement with a BaseScan tx hash
- [x] Deployed live URL
- [ ] Submitted on DoraHacks before the deadline (~Jul 9 2026)
- [ ] Community-vote push (DoraHacks weights voting — share the live URL widely)
