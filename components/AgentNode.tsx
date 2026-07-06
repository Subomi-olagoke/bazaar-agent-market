'use client';

// components/AgentNode.tsx — a custom @xyflow/react node (Lane B).
// Renders one Agent: name (serif), EXTERNAL/OWN provenance, price (mono/gain),
// a reputation meter built from ink-squares that ticks +1, and a "working"
// breathing state while any of its jobs is delivering. Square, no shadow.

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import type { Agent } from '@/lib/types';
import { formatPts, formatUsdc, truncateAddress } from '@/lib/format';

export interface AgentNodeData {
  agent: Agent;
  priceUsdc?: number; // service price snapshot for specialists
  capability?: string; // capability name for specialists
  working?: boolean; // any active job in delivering phase
  settledPulse?: number; // increments when a settlement lands → flashes gain
  [key: string]: unknown;
}

const REP_METER_MAX = 12; // cap the drawn squares; overflow shown numerically

function AgentNodeInner({ data }: { data: AgentNodeData }) {
  const { agent, priceUsdc, capability, working, settledPulse } = data;
  const isOrchestrator = agent.role === 'orchestrator';
  const external = agent.origin === 'external';

  const drawnSquares = Math.min(agent.reputation, REP_METER_MAX);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{
        opacity: 1,
        y: 0,
        scale: working ? [1, 1.012, 1] : 1,
      }}
      transition={
        working
          ? { scale: { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }, opacity: { duration: 0.5 }, y: { duration: 0.5 } }
          : { duration: 0.5, ease: [0.16, 1, 0.3, 1] }
      }
      className={clsx(
        'relative select-none bg-paper',
        isOrchestrator ? 'border border-ink' : 'border border-hairline-hi',
        isOrchestrator ? 'w-[236px]' : 'w-[220px]',
      )}
    >
      {/* Handles: orchestrator emits from the right; specialists receive on left. */}
      {isOrchestrator ? (
        <Handle type="source" position={Position.Right} id="out" />
      ) : (
        <Handle type="target" position={Position.Left} id="in" />
      )}

      {/* Settlement flash — a brief gain-tinted top rule when funds land. */}
      <AnimatePresence>
        {settledPulse ? (
          <motion.div
            key={settledPulse}
            initial={{ scaleX: 0, opacity: 1 }}
            animate={{ scaleX: 1, opacity: 0 }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
            className="pointer-events-none absolute inset-x-0 top-0 h-[2px] origin-left bg-gain"
          />
        ) : null}
      </AnimatePresence>

      <div className="flex items-center justify-between gap-2 border-b border-hairline px-3.5 pb-2 pt-2.5">
        <span className={clsx('label', external ? 'text-ink' : 'text-muted')}>
          {isOrchestrator ? 'ORCHESTRATOR' : external ? 'EXTERNAL' : 'OWN'}
        </span>
        {working ? (
          <span className="label inline-flex items-center gap-1.5 text-muted">
            WORKING
            <span className="ink-cursor" style={{ background: '#72706a' }} />
          </span>
        ) : (
          <span aria-hidden className="ink-square" />
        )}
      </div>

      <div className="px-3.5 py-3">
        <div
          className={clsx(
            'font-serif tracking-display text-ink',
            isOrchestrator ? 'text-[19px] leading-tight' : 'text-[17px] leading-tight',
          )}
        >
          {agent.name}
        </div>

        {capability && !isOrchestrator ? (
          <div className="mt-1 font-serif text-[14px] italic leading-snug text-muted">
            {capability}
          </div>
        ) : null}

        {agent.walletAddress ? (
          <div className="tabular mt-2 text-[10px] text-ink-400">
            {truncateAddress(agent.walletAddress)}
          </div>
        ) : null}
      </div>

      {!isOrchestrator ? (
        <div className="flex items-center justify-between gap-3 border-t border-hairline px-3.5 py-2.5">
          <div className="flex flex-col gap-1">
            <span className="label text-ink-400">Reputation</span>
            <ReputationMeter drawn={drawnSquares} value={agent.reputation} />
          </div>
          {typeof priceUsdc === 'number' ? (
            <div className="flex flex-col items-end gap-1">
              <span className="label text-ink-400">Price</span>
              <span className="tabular text-[13px] text-gain">{formatUsdc(priceUsdc)}</span>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="border-t border-hairline px-3.5 py-2.5">
          <span className="label text-ink-400">Shops the store · hires · verifies · pays</span>
        </div>
      )}
    </motion.div>
  );
}

function ReputationMeter({ drawn, value }: { drawn: number; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-[3px]">
        {Array.from({ length: drawn }).map((_, i) => (
          <motion.span
            key={i}
            aria-hidden
            className="ink-square"
            style={{ background: '#356a45' }}
            initial={i >= drawn - 1 ? { scaleY: 0, opacity: 0 } : false}
            animate={{ scaleY: 1, opacity: 1 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          />
        ))}
        {drawn === 0 ? <span className="tabular text-[11px] text-ink-400">—</span> : null}
      </div>
      <span className="tabular text-[12px] text-gain">{formatPts(value)}</span>
    </div>
  );
}

export const AgentNode = memo(AgentNodeInner);
