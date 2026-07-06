// components/ModeBadge.tsx — SIMULATION vs LIVE·BASE badge (Lane B).
// Driven by a value the page fetched from /api/config. No secrets.

import { clsx } from 'clsx';
import type { Mode } from '@/lib/types';

interface ModeBadgeProps {
  mode: Mode;
  chainId: number;
  className?: string;
}

export function ModeBadge({ mode, chainId, className }: ModeBadgeProps) {
  const live = mode === 'live';
  return (
    <span
      className={clsx(
        'label inline-flex items-center gap-2 border border-hairline px-2.5 py-1',
        live ? 'text-ink' : 'text-muted',
        className,
      )}
      title={live ? 'Live settlement on Base mainnet' : 'Deterministic simulation — no keys required'}
    >
      <span
        aria-hidden
        className={clsx('h-1.5 w-1.5', live ? 'bg-gain' : 'bg-ink-400')}
        style={live ? { animation: 'blink 1.4s steps(1) infinite' } : undefined}
      />
      {live ? `LIVE · BASE ${chainId}` : 'SIMULATION'}
    </span>
  );
}
