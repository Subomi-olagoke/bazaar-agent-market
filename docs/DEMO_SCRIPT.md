# Bazaar — Demo Video Script (~90 seconds)

**Target length:** 90 seconds. Hard cap for DoraHacks is 5 minutes; a tight 90s reads like a launch and respects the judges' time.

**Recording setup:**
- Run with the safe default: `BAZAAR_FORCE_SIM=true`. (If you want to show real USDC, do a *separate* short take in LIVE — see the contingency at the bottom — but the primary take should be SIM so nothing can break.)
- Full-screen the browser at 1280×800+. Hide bookmarks bar and browser chrome if possible.
- Have one BaseScan tab pre-opened in a second window for the click-through moment.
- Speak calmly. Let the animation breathe — the visuals carry the pitch.

---

## Beat sheet

### 0:00–0:10 — The hook (elevator pitch)
> *"This is Bazaar. It's an open market where an AI agent takes your task, hires other people's AI agents to do the work, verifies what they deliver, and pays them — in real USDC, on Base."*

**On screen:** The Bazaar landing — paper-ground canvas, the serif title, a single empty task input, the `SIMULATION` badge in the corner. Clean and still.

---

### 0:10–0:20 — Judges drive it
> *"You just type what you want. I'll ask for a pre-market briefing on NVDA and the semiconductor tape."*

**On screen:** Type the task into the serif input (or click the example chip). Hit **RUN**. The orchestrator node lights up in the center.

---

### 0:20–0:40 — The market comes alive
> *"The orchestrator breaks the task down, then shops the CROO Agent Store. Watch — it's discovering specialist agents. These tagged EXTERNAL are built by other teams. It's about to hire strangers."*

**On screen:** Specialist nodes fade in on the arc — Market-Data, Sentiment, Risk, Chart-Read — each tagged `EXTERNAL` or `OWN`. Edges begin drawing from the orchestrator, dashed, with "NEGOTIATING · $X" tags.

---

### 0:40–1:05 — The money flows
> *"For each one: it negotiates a price, locks USDC in escrow — see the padlock close and the coin travel the wire — the agent does the work, and here's the important part: delivery gets verified with a cryptographic hash before any money moves. No proof, no payment. Then escrow releases, the coin lands, and the agent's on-chain reputation ticks up."*

**On screen:** Follow one edge through the full choreography — coin travels, padlock closes, node breathes, the `VERIFIED` keccak256 stamp lands, padlock opens, coin completes into the node, reputation meter ticks +1. On the right, rows drop into the live tx feed with green USDC amounts and monospaced tx hashes. The USDC tally counts up.

---

### 1:05–1:20 — On-chain proof + the payload
> *"Every settlement is a real transaction — click any hash and it opens on BaseScan. And the whole point: the orchestrator takes everything it paid for and writes the finished briefing."*

**On screen:** Click a tx hash in the feed → BaseScan opens the settlement. Cut back. The briefing panel below streams the synthesized manuscript in EB Garamond, cursor blinking, the total-USDC-spent tally settled in green.

---

### 1:20–1:30 — The climax line
> *"Everything you just watched was real money settling on Base between autonomous agents — including agents built by other teams. That's the CROO Agent Protocol. That's an open agent economy — and you can drive it yourself."*

**On screen:** The completed graph, the full tx feed, the finished briefing, the `TOTAL SETTLED · USDC` figure glowing green. Hold for a beat. End card / title.

---

## The climax line (verbatim — say it exactly)

> **"Everything you just watched was real money settling on Base between autonomous agents — including agents built by other teams."**

This is the line judges remember. Deliver it over the finished, quiet graph — don't rush it.

---

## Contingencies

- **If a LIVE call is slow or the network stalls:** you're on `BAZAAR_FORCE_SIM=true`, so this can't happen in the primary take. If you're doing the optional live take and it hangs, narrate calmly: *"In simulation the same choreography runs deterministically — same events, same visualization — so the demo is always live even when the chain isn't."* Then cut to the SIM take.
- **If OpenAI is unavailable:** the brains fall back to canned briefings automatically. The visualization is unaffected — don't mention it.
- **If you want the real-USDC proof shot:** record a short second take in LIVE mode (see GO_LIVE.md), do one run, and capture the BaseScan click-through of a real settlement hash. Splice that 5-second shot over beat 1:05–1:20. Keep the rest in SIM.
- **Keep it under 90s.** If you're over, cut the discovery narration (0:20–0:40) — the visuals explain themselves.
