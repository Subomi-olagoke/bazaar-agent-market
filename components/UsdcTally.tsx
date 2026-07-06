'use client';

// components/UsdcTally.tsx — the running settlement stats (Lane B).
// Total USDC settled (engraved green), jobs settled, avg reputation. Figures
// count up on each settlement via a small animated-number hook. Tabular, no chrome.

import { useEffect, useRef, useState } from 'react';
import type { MarketState } from '@/lib/types';
import { formatUsdc, formatPts } from '@/lib/format';
import { Hairline } from './Hairline';

interface UsdcTallyProps {
  state: MarketState;
}

export function UsdcTally({ state }: UsdcTallyProps) {
  const specialists = Object.values(state.agents).filter((a) => a.role === 'specialist');
  const avgRep =
    specialists.length > 0
      ? specialists.reduce((sum, a) => sum + a.reputation, 0) / specialists.length
      : 0;

  const total = useCountUp(state.totalUsdc);

  return (
    <section aria-label="Settlement totals" className="w-full">
      <div className="flex items-end justify-between gap-6">
        <Stat label="Total settled" emphasize>
          <span className="tabular text-gain">{formatUsdc(total)}</span>{' '}
          <span className="label text-ink-400">USDC</span>
        </Stat>
        <Stat label="Jobs" align="end">
          <span className="tabular text-ink">{state.jobsSettled}</span>
        </Stat>
        <Stat label="Avg rep" align="end">
          <span className="tabular text-gain">{formatPts(avgRep)}</span>
        </Stat>
      </div>
      <Hairline className="mt-4" strong />
    </section>
  );
}

function Stat({
  label,
  children,
  emphasize,
  align = 'start',
}: {
  label: string;
  children: React.ReactNode;
  emphasize?: boolean;
  align?: 'start' | 'end';
}) {
  return (
    <div className={align === 'end' ? 'text-right' : ''}>
      <div className="label mb-1.5 text-ink-400">{label}</div>
      <div className={emphasize ? 'text-3xl leading-none' : 'text-xl leading-none'}>{children}</div>
    </div>
  );
}

/** Smoothly counts a displayed number up to `value` over ~500ms. */
function useCountUp(value: number): number {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;

    const start = performance.now();
    const duration = 500;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      const current = from + (to - from) * eased;
      setDisplay(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
        setDisplay(to);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      fromRef.current = value;
    };
  }, [value]);

  return display;
}
