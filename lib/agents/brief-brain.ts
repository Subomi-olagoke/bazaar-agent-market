// lib/agents/brief-brain.ts — the AI briefing brain (ports the Edge lib/ai.ts pattern).
//
// Two functions the orchestrator uses:
//   decompose(task)  -> a small set of tagged subtasks (what specialists to hire)
//   synthesize(task, deliverables[]) -> a streamed manuscript briefing (the payload)
//
// Both use OpenAI gpt-4o-mini via the openai SDK. If OPENAI_API_KEY is absent, both
// return canned-but-plausible content so the demo is fully offline-capable. No throw.

import type { CapabilityTag } from '@/lib/agents/specialists';

/** A decomposed subtask, tagged for discovery. */
export interface Subtask {
  /** Natural-language instruction handed to the hired specialist. */
  text: string;
  /** Coarse capability tag used to discover a matching specialist. */
  capabilityTag: CapabilityTag;
}

const VALID_TAGS: CapabilityTag[] = [
  'market-data',
  'sentiment',
  'risk',
  'chart-read',
  'macro',
  'general',
];

/** Safely read OpenAI config from Lane C's config; tolerate it being absent. */
async function getOpenAiConfig(): Promise<{ apiKey: string; miniModel: string } | null> {
  try {
    const { config } = await import('@/lib/config');
    const apiKey = config?.openai?.apiKey;
    if (!apiKey) return null;
    return {
      apiKey,
      miniModel: config?.openai?.miniModel || 'gpt-4o-mini',
    };
  } catch {
    // Fall back to raw env if config isn't importable yet.
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;
    return { apiKey, miniModel: process.env.OPENAI_MINI_MODEL || 'gpt-4o-mini' };
  }
}

/** Lazily construct an OpenAI client (never top-level import to keep SIM light). */
async function getClient(apiKey: string) {
  const { default: OpenAI } = await import('openai');
  return new OpenAI({ apiKey });
}

/** Extract a plausible primary ticker/subject from the task for canned fallbacks. */
function guessSubject(task: string): string {
  const m = task.match(/\b([A-Z]{2,5})\b/);
  return m ? m[1] : 'the market';
}

// ── DECOMPOSE ────────────────────────────────────────────────────────────────

/**
 * Break a task into 3-4 tagged subtasks the orchestrator can hire out. Uses JSON mode
 * on gpt-4o-mini; validates + clamps to known tags. Canned fallback when no key.
 */
export async function decompose(task: string): Promise<Subtask[]> {
  const oa = await getOpenAiConfig();
  if (!oa) return cannedDecompose(task);

  try {
    const client = await getClient(oa.apiKey);
    const system = [
      'You are the planning core of an autonomous agent orchestrator operating a market briefing.',
      'Break the user task into 3-4 concrete SUBTASKS, each hired out to one specialist agent.',
      'Each subtask MUST be tagged with exactly one capabilityTag from this set:',
      `${VALID_TAGS.join(', ')}.`,
      'Prefer coverage: typically market-data, sentiment, risk, and optionally chart-read or macro.',
      'Respond with STRICT JSON: {"subtasks":[{"text":"...","capabilityTag":"..."}]}. No prose.',
    ].join(' ');

    const resp = await client.chat.completions.create({
      model: oa.miniModel,
      max_tokens: 500,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `Task: ${task}` },
      ],
    });

    const raw = (resp.choices[0]?.message?.content ?? '').trim();
    const parsed = JSON.parse(raw) as { subtasks?: Array<{ text?: unknown; capabilityTag?: unknown }> };
    const out: Subtask[] = [];
    for (const s of parsed.subtasks ?? []) {
      const text = typeof s.text === 'string' ? s.text.trim() : '';
      const tag = String(s.capabilityTag) as CapabilityTag;
      if (text && VALID_TAGS.includes(tag)) out.push({ text, capabilityTag: tag });
    }
    if (out.length >= 2) return out.slice(0, 4);
    return cannedDecompose(task); // model returned something unusable
  } catch (err) {
    console.warn('[brief-brain] decompose fell back to canned:', (err as Error)?.message);
    return cannedDecompose(task);
  }
}

/** Deterministic canned decomposition — always a full, plausible plan. */
export function cannedDecompose(task: string): Subtask[] {
  const subject = guessSubject(task);
  return [
    {
      text: `Pull the current tape and key levels for ${subject}: price, session range, relative volume, support/resistance.`,
      capabilityTag: 'market-data',
    },
    {
      text: `Score news and social sentiment around ${subject} and the semiconductor tape; surface the dominant narrative and any contrarian flag.`,
      capabilityTag: 'sentiment',
    },
    {
      text: `Frame the risk on ${subject}: volatility posture, the next scheduled event risk, and a sensible invalidation level.`,
      capabilityTag: 'risk',
    },
    {
      text: `Read the multi-timeframe chart structure for ${subject}: trend, notable pattern, moving-average posture, the level that matters most.`,
      capabilityTag: 'chart-read',
    },
  ];
}

// ── SYNTHESIZE ───────────────────────────────────────────────────────────────

/** A verified deliverable fed into synthesis. */
export interface DeliverableInput {
  specialistName: string;
  capabilityTag: string;
  text: string;
}

/**
 * Synthesize the final manuscript briefing from the verified deliverables, streamed as
 * chunks via onDelta. Grounds ONLY in the deliverables; framed as educational, ~180
 * words, **bold** mini-headers, no advice. Canned streamed fallback when no key.
 * Returns the full text.
 */
export async function synthesize(
  task: string,
  deliverables: DeliverableInput[],
  onDelta: (chunk: string) => void,
): Promise<string> {
  const oa = await getOpenAiConfig();
  if (!oa || deliverables.length === 0) {
    return streamCanned(cannedSynthesize(task, deliverables), onDelta);
  }

  try {
    const client = await getClient(oa.apiKey);
    const system = [
      'You are the synthesis core of an autonomous agent orchestrator.',
      'Several specialist agents were HIRED and PAID in USDC; each returned a verified deliverable.',
      'Write one sharp market BRIEFING that integrates ONLY those deliverables — do not invent',
      'facts or prices beyond them. Educational journaling tone, never financial advice, no',
      'buy/sell instructions. Format: one short greeting line, then 2-4 sections with **bold**',
      'inline mini-headers (no markdown headings). Under ~180 words. Close with one discipline prompt.',
    ].join(' ');

    const deliverableBlock = deliverables
      .map((d) => `[${d.specialistName} · ${d.capabilityTag}]\n${d.text}`)
      .join('\n\n');

    const user = [
      `Original task: ${task}`,
      '',
      'Verified deliverables from the hired specialist agents:',
      deliverableBlock,
      '',
      "Write today's briefing now, integrating only the above.",
    ].join('\n');

    const stream = await client.chat.completions.create({
      model: oa.miniModel,
      max_tokens: 600,
      temperature: 0.6,
      stream: true,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });

    let full = '';
    for await (const part of stream) {
      const chunk = part.choices[0]?.delta?.content ?? '';
      if (chunk) {
        full += chunk;
        onDelta(chunk);
      }
    }
    full = full.trim();
    if (!full) return streamCanned(cannedSynthesize(task, deliverables), onDelta);
    return full;
  } catch (err) {
    console.warn('[brief-brain] synthesize fell back to canned:', (err as Error)?.message);
    return streamCanned(cannedSynthesize(task, deliverables), onDelta);
  }
}

/** Deterministic canned synthesis grounded in whatever deliverables arrived. */
export function cannedSynthesize(task: string, deliverables: DeliverableInput[]): string {
  const subject = guessSubject(task);
  if (deliverables.length === 0) {
    return [
      `Morning. Here is the read on ${subject}.`,
      '',
      `**Setup** No specialist deliverables cleared this run, so treat this as a structural note only: ${subject} sits inside a broader semiconductor tape driven by AI-datacenter demand and shifting supply.`,
      '',
      `**Discipline** When the data is thin, size down and let the tape confirm before acting. Observation, not advice.`,
    ].join('\n');
  }

  const lines: string[] = [`Morning. Here is the synthesized read on ${subject}, assembled from the agents you hired.`, ''];
  for (const d of deliverables) {
    const header = d.capabilityTag
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    lines.push(`**${header}** ${d.text}`);
    lines.push('');
  }
  lines.push(
    '**Discipline** Every line above was paid for and verified on-chain — but it is context, not a directive. Define your invalidation before you act, and let the tape confirm the thesis.',
  );
  return lines.join('\n').trim();
}

/** Emit a fixed string as jittered chunks so canned output still "streams" in the UI. */
async function streamCanned(full: string, onDelta: (chunk: string) => void): Promise<string> {
  // Split on word boundaries, emit a few words at a time.
  const tokens = full.match(/\S+\s*/g) ?? [full];
  let i = 0;
  while (i < tokens.length) {
    const take = 2 + Math.floor(Math.random() * 3);
    const chunk = tokens.slice(i, i + take).join('');
    onDelta(chunk);
    i += take;
    // Small delay so the ink-cursor animates; keep total well under a couple seconds.
    await new Promise((r) => setTimeout(r, 24));
  }
  return full;
}
