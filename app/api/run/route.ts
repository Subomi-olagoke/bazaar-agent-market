// app/api/run/route.ts — Lane C
// POST { task: string } → a Server-Sent Events stream of JobEvents.
//
// This route is the transport seam: it instantiates the JobEventEmitter (Lane C
// plumbing), kicks off the orchestrator (Lane A) with `emit`, and pipes every
// emitted JobEvent to the client as SSE. The orchestrator itself picks the CAP
// adapter (SIM/LIVE) via getCapAdapter(); this route stays adapter-agnostic.

import { NextRequest } from 'next/server';
import { z } from 'zod';
import type { JobEvent } from '@/lib/types';
import { JobEventEmitter, toSSE, sseComment } from '@/lib/events';
import { config } from '@/lib/config';
// Lane A contract: orchestrator/orchestrator.ts exports `run(task, emit) => Promise<void>`.
import { run as runOrchestration } from '@/lib/orchestrator/orchestrator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  task: z.string().trim().min(1, 'task is required').max(2000),
});

const encoder = new TextEncoder();
const HEARTBEAT_MS = 15000;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid JSON body', 400);
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'invalid request', 400);
  }
  const { task } = parsed.data;

  const emitter = new JobEventEmitter();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      // Heartbeat so intermediary proxies keep the connection open during quiet
      // stretches (e.g. an OpenAI synthesis call).
      const heartbeat = setInterval(() => safeEnqueue(sseComment()), HEARTBEAT_MS);

      const finish = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      // Client disconnect → stop the producer.
      req.signal.addEventListener('abort', () => {
        emitter.close();
        finish();
      });

      // Drain the emitter to the client.
      (async () => {
        try {
          for await (const event of emitter) {
            safeEnqueue(toSSE(event as JobEvent));
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'stream error';
          safeEnqueue(toSSE({ type: 'run.error', runId: '', message, at: Date.now() }));
        } finally {
          finish();
        }
      })();

      // Kick off the orchestration. It emits everything (including run.completed /
      // run.error) through `emitter.emit`, which closes the stream on a terminal
      // event. We guard here as a backstop if the orchestrator throws before it
      // manages to emit its own terminal event.
      (async () => {
        try {
          await runOrchestration(task, emitter.emit);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'orchestration failed';
          emitter.emit({ type: 'run.error', runId: '', message, at: Date.now() });
        } finally {
          // Backstop: if the orchestrator returned without a terminal event, close.
          emitter.close();
        }
      })();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'X-Bazaar-Mode': config.mode,
    },
  });
}

// A GET on this route is a convenience for EventSource-style clients that can't POST.
// The task is passed as a `?task=` query param.
export async function GET(req: NextRequest) {
  const task = req.nextUrl.searchParams.get('task');
  if (!task) return jsonError('task query param is required', 400);
  const forwarded = new NextRequest(req.nextUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ task }),
    signal: req.signal,
  });
  return POST(forwarded);
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
