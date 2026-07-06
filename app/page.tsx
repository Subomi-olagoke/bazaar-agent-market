'use client';

// app/page.tsx — Bazaar's single cinematic page (Lane B).
//
// Layout: masthead (title + mode badge) → TaskConsole (judges drive it) →
// a two-pane stage [ money-flow graph | tx feed + tally ] → the synthesized
// briefing manuscript below. Owns the run lifecycle via useJobStream and pulls
// PublicConfig from /api/config (mode, chainId, basescanBase, exampleTasks).

import { useEffect, useMemo, useRef, useState } from 'react';
import type { PublicConfig } from '@/lib/types';
import { useJobStream } from '@/lib/use-job-stream';
import { TaskConsole } from '@/components/TaskConsole';
import { MarketGraph } from '@/components/MarketGraph';
import { TxFeed } from '@/components/TxFeed';
import { UsdcTally } from '@/components/UsdcTally';
import { BriefingPanel } from '@/components/BriefingPanel';
import { ModeBadge } from '@/components/ModeBadge';
import { Hairline } from '@/components/Hairline';

const DEFAULT_CONFIG: PublicConfig = {
  mode: 'sim',
  chainId: 8453,
  basescanBase: 'https://basescan.org/tx/',
  exampleTasks: [
    'Give me a pre-market briefing on NVDA and the semiconductor tape.',
    'Brief me on the macro setup into this week’s CPI print.',
    'What’s the read on Bitcoin and crypto risk appetite right now?',
  ],
};

export default function Page() {
  const { state, isRunning, run } = useJobStream();
  const [config, setConfig] = useState<PublicConfig>(DEFAULT_CONFIG);

  // Pull public runtime config; fall back to sensible SIM defaults on failure.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/config')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('config'))))
      .then((cfg: PublicConfig) => {
        if (!cancelled && cfg) setConfig({ ...DEFAULT_CONFIG, ...cfg });
      })
      .catch(() => void 0);
    return () => {
      cancelled = true;
    };
  }, []);

  // The mode shown in the UI: server config, but once a run reports its mode,
  // trust that (the run authoritatively resolved live vs sim).
  const displayMode = state.status === 'idle' ? config.mode : state.mode;

  // Per-agent settlement pulse counters → drive the node gain-flash without
  // storing UI concerns in MarketState.
  const settledPulses = useSettlementPulses(state.settlements.map((s) => s.toAgentId));

  const hasActivity = Object.keys(state.agents).length > 0 || state.status !== 'idle';

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1400px] flex-col px-6 py-8 md:px-10">
      {/* Masthead */}
      <header className="animate-enter flex items-start justify-between gap-6">
        <div>
          <div className="mb-2 flex items-center gap-2.5">
            <span aria-hidden className="ink-square" />
            <span className="label text-ink">Bazaar</span>
          </div>
          <h1 className="max-w-[22ch] font-serif text-[34px] font-normal leading-[1.05] tracking-display text-ink md:text-[42px]">
            An open market for autonomous agents.
          </h1>
          <p className="mt-3 max-w-[56ch] font-serif text-[17px] italic leading-relaxed text-muted">
            An orchestrator takes your task, shops the live CROO Agent Store, hires
            specialists from strangers, verifies their work, and pays them real
            USDC on Base.
          </p>
        </div>
        <ModeBadge mode={displayMode} chainId={config.chainId} className="mt-1 shrink-0" />
      </header>

      <div className="animate-enter enter-1 mt-8">
        <TaskConsole onRun={run} isRunning={isRunning} exampleTasks={config.exampleTasks} disabled={isRunning} />
      </div>

      {/* Error banner (non-fatal — a run always degrades rather than dying). */}
      {state.error ? (
        <div className="mt-4 border border-loss px-4 py-2.5">
          <span className="label text-loss">Run notice</span>
          <span className="ml-3 font-serif text-[15px] italic text-body">{state.error}</span>
        </div>
      ) : null}

      {/* The stage: graph + right rail. */}
      <div className="animate-enter enter-2 mt-8 grid flex-1 grid-cols-1 gap-0 border border-hairline lg:grid-cols-[1fr_360px]">
        {/* Money-flow canvas */}
        <div className="relative min-h-[520px] bg-canvas">
          {hasActivity ? (
            <MarketGraph state={state} settledPulses={settledPulses} />
          ) : (
            <EmptyStage />
          )}
          <RunStatusOverlay status={state.status} agentCount={Object.keys(state.agents).length} />
        </div>

        {/* Right rail: tally + tx feed */}
        <div className="flex flex-col border-t border-hairline lg:border-l lg:border-t-0">
          <div className="px-5 py-5">
            <UsdcTally state={state} />
          </div>
          <div className="min-h-0 flex-1 px-5 pb-5">
            <TxFeed state={state} basescanBase={config.basescanBase} />
          </div>
        </div>
      </div>

      {/* The briefing manuscript */}
      <div className="animate-enter enter-3 mt-10">
        <BriefingPanel state={state} />
      </div>

      {/* Climax footnote — appears once a run has settled real value. */}
      {state.status === 'completed' && state.jobsSettled > 0 ? (
        <div className="animate-enter mt-8">
          <Hairline />
          <p className="mt-5 max-w-[70ch] font-serif text-[19px] leading-relaxed tracking-display text-ink">
            Everything you just watched was{' '}
            {displayMode === 'live' ? 'real money settling on Base' : 'a faithful simulation of money settling on Base'}{' '}
            between autonomous agents — including agents built by other teams.
          </p>
        </div>
      ) : null}

      <footer className="mt-10 flex items-center justify-between pt-4">
        <span className="label text-ink-400">CROO Agent Protocol · CAP</span>
        <span className="label text-ink-400">No proof, no payment.</span>
      </footer>
    </main>
  );
}

/** The pre-run empty canvas — a quiet invitation, not a spinner. */
function EmptyStage() {
  return (
    <div className="flex h-full min-h-[520px] flex-col items-center justify-center px-8 text-center">
      <div className="mb-5 flex items-center gap-2">
        <span aria-hidden className="ink-square" />
        <span aria-hidden className="ink-square" style={{ opacity: 0.5 }} />
        <span aria-hidden className="ink-square" style={{ opacity: 0.25 }} />
      </div>
      <p className="max-w-[42ch] font-serif text-[20px] italic leading-relaxed text-ink-400">
        The market is quiet. Give it a task above and watch the orchestrator
        discover, hire, and pay specialist agents in real time.
      </p>
    </div>
  );
}

/** A small top-corner status line inside the canvas while running. */
function RunStatusOverlay({
  status,
  agentCount,
}: {
  status: string;
  agentCount: number;
}) {
  if (status !== 'running') return null;
  return (
    <div className="pointer-events-none absolute left-4 top-4 z-10 flex items-center gap-2 border border-hairline bg-canvas/90 px-2.5 py-1 backdrop-blur-sm">
      <span className="ink-cursor" />
      <span className="label text-muted">
        {agentCount === 0 ? 'PLANNING' : `SHOPPING THE STORE · ${agentCount} AGENTS`}
      </span>
    </div>
  );
}

/**
 * Maps the append-only settlement payee list into a per-agent pulse counter.
 * Each new settlement to an agent bumps that agent's counter, which AgentNode
 * watches to flash a gain rule — without leaking view state into MarketState.
 */
function useSettlementPulses(payeeSequence: string[]): Record<string, number> {
  const [pulses, setPulses] = useState<Record<string, number>>({});
  const seenRef = useRef(0);

  useEffect(() => {
    if (payeeSequence.length <= seenRef.current) {
      // Reset when a new run clears the settlements.
      if (payeeSequence.length === 0 && seenRef.current !== 0) {
        seenRef.current = 0;
        setPulses({});
      }
      return;
    }
    const fresh = payeeSequence.slice(seenRef.current);
    seenRef.current = payeeSequence.length;
    setPulses((prev) => {
      const next = { ...prev };
      for (const id of fresh) next[id] = (next[id] ?? 0) + 1;
      return next;
    });
  }, [payeeSequence]);

  return pulses;
}
