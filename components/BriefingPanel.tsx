'use client';

// components/BriefingPanel.tsx — the synthesized manuscript (Lane B).
// Renders the orchestrator's final briefing in EB Garamond (.manuscript),
// streaming token-by-token with a trailing ink-cursor while the run is live,
// settling static on briefing.done. A light **bold** / paragraph renderer —
// no external markdown dep (keeps the bundle lean and the look controlled).

import { useMemo } from 'react';
import type { MarketState } from '@/lib/types';
import { formatUsdc } from '@/lib/format';
import { Hairline } from './Hairline';

interface BriefingPanelProps {
  state: MarketState;
}

export function BriefingPanel({ state }: BriefingPanelProps) {
  const { briefing, status } = state;
  const streaming = status === 'running';
  const hasContent = briefing.trim().length > 0;

  const blocks = useMemo(() => parseManuscript(briefing), [briefing]);

  return (
    <section aria-label="Synthesized briefing" className="w-full">
      <header className="flex items-baseline justify-between pb-3">
        <h2 className="label text-ink">The briefing</h2>
        {state.jobsSettled > 0 ? (
          <span className="label text-ink-400">
            synthesized from {state.jobsSettled}{' '}
            {state.jobsSettled === 1 ? 'deliverable' : 'deliverables'} ·{' '}
            <span className="tabular text-gain">{formatUsdc(state.totalUsdc)}</span> USDC
          </span>
        ) : null}
      </header>
      <Hairline strong />

      <div className="pt-5">
        {!hasContent && !streaming ? (
          <p className="font-serif text-[16px] italic leading-relaxed text-ink-400">
            The orchestrator will synthesize the specialists&apos; verified
            deliverables into one manuscript briefing here — grounded only in
            work it actually paid for.
          </p>
        ) : (
          <div className="manuscript max-w-[68ch]">
            {blocks.map((block, i) => (
              <Block key={i} block={block} />
            ))}
            {streaming ? <span className="ink-cursor" /> : null}
          </div>
        )}
      </div>
    </section>
  );
}

type Block =
  | { kind: 'h'; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'li'; text: string };

/** Minimal, forgiving manuscript parser: headings, list items, and paragraphs,
 *  with inline **bold** and *italic*. Tolerates half-streamed markers. */
function parseManuscript(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];

  const flush = () => {
    if (para.length) {
      const text = para.join(' ').trim();
      if (text) blocks.push({ kind: 'p', text });
      para = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const h = line.match(/^#{1,3}\s+(.*)$/);
    if (h) {
      flush();
      blocks.push({ kind: 'h', text: h[1] });
      continue;
    }
    // A line that is entirely a bold header, e.g. "**Setup**"
    const boldHead = line.match(/^\*\*(.+?)\*\*:?\s*$/);
    if (boldHead) {
      flush();
      blocks.push({ kind: 'h', text: boldHead[1] });
      continue;
    }
    const li = line.match(/^[-•*]\s+(.*)$/);
    if (li) {
      flush();
      blocks.push({ kind: 'li', text: li[1] });
      continue;
    }
    para.push(line);
  }
  flush();
  return blocks;
}

function Block({ block }: { block: Block }) {
  const content = renderInline(block.text);
  if (block.kind === 'h') return <h3>{content}</h3>;
  if (block.kind === 'li')
    return (
      <ul>
        <li>{content}</li>
      </ul>
    );
  return <p>{content}</p>;
}

/** Render inline **bold** and *italic* into React nodes (no dangerouslySetInnerHTML). */
function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] !== undefined) nodes.push(<strong key={key++}>{m[2]}</strong>);
    else if (m[3] !== undefined) nodes.push(<em key={key++}>{m[3]}</em>);
    else if (m[4] !== undefined) nodes.push(<em key={key++}>{m[4]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}
