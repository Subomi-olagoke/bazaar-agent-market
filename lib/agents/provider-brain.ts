// lib/agents/provider-brain.ts — the specialist "work" function.
//
// Given a subtask + a specialist definition, produce a deliverable. Reused by:
//   - SIM adapter, to fabricate a specialist's deliverable during a fake hire.
//   - LIVE provider workers, as the actual brain that answers a hired order.
//
// Uses OpenAI gpt-4o-mini via the specialist's systemPrompt. Falls back to the
// specialist's cannedDeliverable when no OPENAI_API_KEY is present. Never throws.

import type { SpecialistDef } from '@/lib/agents/specialists';

/** Safely read OpenAI config from Lane C's config; tolerate absence. */
async function getOpenAiConfig(): Promise<{ apiKey: string; miniModel: string } | null> {
  try {
    const { config } = await import('@/lib/config');
    const apiKey = config?.openai?.apiKey;
    if (!apiKey) return null;
    return { apiKey, miniModel: config?.openai?.miniModel || 'gpt-4o-mini' };
  } catch {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;
    return { apiKey, miniModel: process.env.OPENAI_MINI_MODEL || 'gpt-4o-mini' };
  }
}

async function getClient(apiKey: string) {
  const { default: OpenAI } = await import('openai');
  return new OpenAI({ apiKey });
}

/**
 * Produce a specialist deliverable for a subtask. Returns plain text (the work product).
 * Deterministic canned fallback when no key or on any error — the demo never dead-ends.
 */
export async function produceDeliverable(input: {
  def: SpecialistDef;
  subtask: string;
}): Promise<string> {
  const { def, subtask } = input;
  const oa = await getOpenAiConfig();
  if (!oa) return def.cannedDeliverable;

  try {
    const client = await getClient(oa.apiKey);
    const resp = await client.chat.completions.create({
      model: oa.miniModel,
      max_tokens: 320,
      temperature: 0.6,
      messages: [
        { role: 'system', content: def.systemPrompt },
        { role: 'user', content: `Subtask: ${subtask}` },
      ],
    });
    const text = (resp.choices[0]?.message?.content ?? '').trim();
    return text || def.cannedDeliverable;
  } catch (err) {
    console.warn(`[provider-brain] ${def.agentId} fell back to canned:`, (err as Error)?.message);
    return def.cannedDeliverable;
  }
}
