'use client';

// components/JobEdge.tsx — the animated money-flow edge (Lane B).
//
// One edge = one Job (orchestrator → specialist). It layers, by JobPhase:
//   negotiating → dashed animated draw + "NEGOTIATING · $X" tag
//   accepted    → solid hairline + "ORDER CREATED"
//   funded      → USDC coin travels along the path (framer-motion offsetDistance),
//                 a closed padlock appears mid-edge (escrow locked)
//   delivering  → coin pauses ~mid path (specialist node breathes)
//   verified    → keccak256 hash stamp scales in · "VERIFIED · NO PROOF NO PAYMENT"
//   settled     → padlock opens, coin completes into the specialist, edge → hairline
//   rejected/expired → edge turns loss, brief shake
//
// Motion is restrained (ease vellum, 300–700ms) — premium, not neon.

import { memo, useMemo } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import type { Job, JobPhase } from '@/lib/types';
import { formatUsdc, truncateReceipt } from '@/lib/format';

const EASE_VELLUM: [number, number, number, number] = [0.16, 1, 0.3, 1];

export interface JobEdgeData {
  job: Job;
  [key: string]: unknown;
}

// Phases where escrow is locked (padlock closed, edge tinted darker).
const LOCKED: JobPhase[] = ['funded', 'delivering', 'verified'];
// Phases where the coin should be visible somewhere on the path.
const COIN_VISIBLE: JobPhase[] = ['funded', 'delivering', 'verified', 'settled'];

function coinTarget(phase: JobPhase): number {
  switch (phase) {
    case 'funded':
      return 0.5; // travels out to escrow (mid-path lock)
    case 'delivering':
      return 0.5; // holds at escrow while provider works
    case 'verified':
      return 0.5; // still escrowed until proof clears
    case 'settled':
      return 1; // released into the specialist
    default:
      return 0;
  }
}

function JobEdgeInner(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    markerEnd,
    data,
  } = props;

  const job = (data as JobEdgeData | undefined)?.job;
  const phase: JobPhase = job?.phase ?? 'discovered';

  const [edgePath, labelX, labelY] = useMemo(
    () =>
      getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        curvature: 0.35,
      }),
    [sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition],
  );

  const failed = phase === 'rejected' || phase === 'expired';
  const locked = LOCKED.includes(phase);
  const negotiating = phase === 'negotiating';
  const showCoin = COIN_VISIBLE.includes(phase);
  const target = coinTarget(phase);

  const stroke = failed ? '#a32b22' : locked ? '#8a8983' : '#dcdbd7';
  const strokeWidth = failed || locked ? 1.5 : 1;

  return (
    <>
      {/* The base path (solid hairline / locked / failed tint). */}
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke,
          strokeWidth,
          transition: 'stroke 400ms cubic-bezier(0.16,1,0.3,1)',
        }}
      />

      {/* A dashed overlay marching along the path while negotiating. */}
      {negotiating ? (
        <motion.path
          d={edgePath}
          fill="none"
          stroke="#6b6a65"
          strokeWidth={1}
          strokeDasharray="4 4"
          initial={{ strokeDashoffset: 0 }}
          animate={{ strokeDashoffset: -16 }}
          transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
        />
      ) : null}

      {/* The travelling USDC coin — motion-path along the same bezier. */}
      {showCoin ? (
        <EdgeLabelRenderer>
          <TravellingCoin
            path={edgePath}
            target={target}
            amount={job?.priceUsdc ?? 0}
            settled={phase === 'settled'}
          />
        </EdgeLabelRenderer>
      ) : null}

      {/* Mid-edge annotations: negotiation tag, padlock, verified stamp. */}
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-none absolute"
          style={{ transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`, zIndex: 5 }}
        >
          <EdgeAnnotation phase={phase} job={job} />
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

/**
 * A small ink coin that rides `offset-path` along the edge's bezier. framer-motion
 * animates `offsetDistance` from 0 → target so the coin visibly travels, pauses at
 * escrow, then completes into the payee on settlement.
 */
function TravellingCoin({
  path,
  target,
  amount,
  settled,
}: {
  path: string;
  target: number;
  amount: number;
  settled: boolean;
}) {
  return (
    <motion.div
      className="nodrag nopan pointer-events-none absolute left-0 top-0"
      style={{
        offsetPath: `path('${path}')`,
        offsetRotate: '0deg',
        zIndex: 6,
      }}
      initial={{ offsetDistance: '0%', opacity: 0, scale: 0.6 }}
      animate={{
        offsetDistance: `${target * 100}%`,
        opacity: settled ? [1, 1, 0] : 1,
        scale: settled ? [1, 1, 0.7] : 1,
      }}
      transition={{
        offsetDistance: { duration: settled ? 0.7 : 0.6, ease: EASE_VELLUM },
        opacity: { duration: settled ? 0.9 : 0.3, ease: 'easeOut' },
        scale: { duration: settled ? 0.9 : 0.3, ease: EASE_VELLUM },
      }}
    >
      <span
        className={clsx(
          'flex h-[22px] w-[22px] -translate-x-1/2 -translate-y-1/2 items-center justify-center',
          'border tabular text-[10px] font-medium',
          settled ? 'border-gain bg-canvas text-gain' : 'border-ink bg-paper text-ink',
        )}
        style={{ borderRadius: '9999px' }}
        title={`${formatUsdc(amount)} USDC in escrow`}
      >
        $
      </span>
    </motion.div>
  );
}

function EdgeAnnotation({ phase, job }: { phase: JobPhase; job: Job | undefined }) {
  const price = job?.priceUsdc ?? 0;

  return (
    <AnimatePresence mode="wait">
      {phase === 'negotiating' && (
        <motion.div
          key="neg"
          {...tagMotion}
          className="whitespace-nowrap border border-hairline bg-canvas px-2 py-1"
        >
          <span className="label text-muted">
            NEGOTIATING · <span className="tabular text-gain">{formatUsdc(price)}</span>
          </span>
        </motion.div>
      )}

      {phase === 'accepted' && (
        <motion.div key="acc" {...tagMotion} className="whitespace-nowrap border border-hairline bg-canvas px-2 py-1">
          <span className="label text-muted">ORDER CREATED</span>
        </motion.div>
      )}

      {(phase === 'funded' || phase === 'delivering') && (
        <motion.div key="lock" {...tagMotion} className="flex items-center gap-1.5 whitespace-nowrap border border-hairline-hi bg-canvas px-2 py-1">
          <PadlockGlyph open={false} />
          <span className="label text-muted">ESCROW LOCKED</span>
        </motion.div>
      )}

      {phase === 'verified' && (
        <motion.div
          key="verified"
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: EASE_VELLUM }}
          className="flex flex-col items-center gap-1 whitespace-nowrap border border-ink bg-canvas px-2.5 py-1.5"
        >
          <span className="label text-ink">VERIFIED · NO PROOF NO PAYMENT</span>
          {job?.deliverableHash ? (
            <span className="tabular text-[10px] text-muted">{truncateReceipt(job.deliverableHash)}</span>
          ) : null}
        </motion.div>
      )}

      {phase === 'settled' && (
        <motion.div key="settled" {...tagMotion} className="flex items-center gap-1.5 whitespace-nowrap border border-gain bg-canvas px-2 py-1">
          <PadlockGlyph open />
          <span className="label" style={{ color: '#356a45' }}>
            SETTLED
          </span>
        </motion.div>
      )}

      {(phase === 'rejected' || phase === 'expired') && (
        <motion.div
          key="failed"
          initial={{ opacity: 0, x: 0 }}
          animate={{ opacity: 1, x: [0, -3, 3, -2, 2, 0] }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="whitespace-nowrap border border-loss bg-canvas px-2 py-1"
        >
          <span className="label text-loss">{phase.toUpperCase()}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const tagMotion = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.3, ease: EASE_VELLUM },
} as const;

/** A tiny square-shackle padlock drawn in ink strokes (radius 0 spirit). */
function PadlockGlyph({ open }: { open: boolean }) {
  return (
    <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden fill="none">
      {/* shackle */}
      <path
        d={open ? 'M3 5 V3.2 A2 2 0 0 1 8 3.2' : 'M3 5 V3.2 A2 2 0 0 1 7 3.2 V5'}
        stroke={open ? '#356a45' : '#6b6a65'}
        strokeWidth="1"
      />
      {/* body */}
      <rect x="1.5" y="5" width="7" height="6" stroke={open ? '#356a45' : '#4a4945'} strokeWidth="1" />
    </svg>
  );
}

export const JobEdge = memo(JobEdgeInner);
