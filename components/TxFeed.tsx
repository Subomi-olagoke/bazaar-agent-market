'use client';

// components/TxFeed.tsx — the live on-chain settlement feed (Lane B).
// Newest-at-top. Each row: payee name, −amount USDC (engraved green), the
// settlement tx hash (mono) linking out to Basescan, and the keccak256
// deliverable receipt as the "no proof, no payment" stamp.

import { AnimatePresence, motion } from 'framer-motion';
import type { MarketState, Settlement } from '@/lib/types';
import { formatUsdcSigned, truncateHash, truncateReceipt } from '@/lib/format';
import { Hairline } from './Hairline';

interface TxFeedProps {
  state: MarketState;
  basescanBase: string;
}

export function TxFeed({ state, basescanBase }: TxFeedProps) {
  // Newest first for the feed (state.settlements is append-oldest-first).
  const rows = [...state.settlements].reverse();
  const nameOf = (id: string) => state.agents[id]?.name ?? id;

  return (
    <section className="flex h-full flex-col" aria-label="Live settlement feed">
      <header className="flex items-baseline justify-between pb-3">
        <h2 className="label text-ink">On-chain settlements</h2>
        <span className="tabular text-[11px] text-muted">{rows.length}</span>
      </header>
      <Hairline strong />

      {rows.length === 0 ? (
        <div className="flex flex-1 items-center py-8">
          <p className="font-serif text-[15px] italic leading-relaxed text-ink-400">
            No settlements yet. When the orchestrator pays a specialist, the
            USDC transfer and its verified receipt appear here — each hash links
            to Base.
          </p>
        </div>
      ) : (
        <ul className="flex-1 divide-y divide-hairline overflow-y-auto">
          <AnimatePresence initial={false}>
            {rows.map((s) => (
              <FeedRow key={s.id} settlement={s} payee={nameOf(s.toAgentId)} basescanBase={basescanBase} />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}

function FeedRow({
  settlement: s,
  payee,
  basescanBase,
}: {
  settlement: Settlement;
  payee: string;
  basescanBase: string;
}) {
  const txUrl = s.explorerUrl || `${basescanBase}${s.clearTxHash}`;
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -8, backgroundColor: 'rgba(53,106,69,0.06)' }}
      animate={{ opacity: 1, y: 0, backgroundColor: 'rgba(53,106,69,0)' }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="py-3"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate font-serif text-[16px] tracking-display text-ink">{payee}</span>
        <span className="tabular shrink-0 text-[13px] text-gain">
          {formatUsdcSigned(s.amountUsdc)} {s.token}
        </span>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <a
          href={txUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="tabular text-[11px] text-muted underline decoration-hairline-hi underline-offset-2 transition-colors hover:text-ink hover:decoration-ink"
          title={s.clearTxHash}
        >
          {truncateHash(s.clearTxHash)}
        </a>
        <span aria-hidden className="ink-square" style={{ background: '#356a45', width: 6, height: 6 }} />
        <span className="tabular text-[11px] text-ink-400" title={`keccak256 deliverable proof · ${s.deliverableHash}`}>
          proof {truncateReceipt(s.deliverableHash)}
        </span>
      </div>
    </motion.li>
  );
}
