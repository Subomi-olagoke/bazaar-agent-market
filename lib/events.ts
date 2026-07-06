// lib/events.ts — Lane C
// The JobEvent transport plumbing shared between the orchestrator (Lane A) and the
// SSE route (Lane C's app/api/run/route.ts). Keeps Lane A transport-agnostic: the
// orchestrator only ever calls `emit(event)`, never touching HTTP/SSE.
//
// Core idea: `JobEventEmitter` is a tiny async-iterable buffer. Producers push
// JobEvents via `emit()`; the route drains it via `for await (const e of emitter)`.
// A terminal event (run.completed / run.error) closes the iterator so the SSE
// stream ends cleanly.

import type { JobEvent } from '@/lib/types';

/** Event types after which no further events are expected — they close the stream. */
const TERMINAL_TYPES: ReadonlySet<JobEvent['type']> = new Set([
  'run.completed',
  'run.error',
]);

/**
 * An async-iterable JobEvent buffer. Single-producer / single-consumer, which is
 * exactly the run→route relationship. Backpressure is bounded only by memory (a
 * demo run emits at most a few hundred events), which is fine for this use case.
 */
export class JobEventEmitter implements AsyncIterable<JobEvent> {
  private queue: JobEvent[] = [];
  private resolvers: Array<(r: IteratorResult<JobEvent>) => void> = [];
  private closed = false;

  /** Push an event to any waiting consumer, or buffer it until one arrives. */
  emit = (event: JobEvent): void => {
    if (this.closed) return;
    const resolver = this.resolvers.shift();
    if (resolver) {
      resolver({ value: event, done: false });
    } else {
      this.queue.push(event);
    }
    if (TERMINAL_TYPES.has(event.type)) {
      // Let the terminal event flush, then close on the next microtask.
      queueMicrotask(() => this.close());
    }
  };

  /** Close the stream: flush no more events, resolve any pending waiters as done. */
  close = (): void => {
    if (this.closed) return;
    this.closed = true;
    while (this.resolvers.length) {
      this.resolvers.shift()!({ value: undefined as unknown as JobEvent, done: true });
    }
  };

  [Symbol.asyncIterator](): AsyncIterator<JobEvent> {
    return {
      next: (): Promise<IteratorResult<JobEvent>> => {
        const buffered = this.queue.shift();
        if (buffered !== undefined) {
          return Promise.resolve({ value: buffered, done: false });
        }
        if (this.closed) {
          return Promise.resolve({ value: undefined as unknown as JobEvent, done: true });
        }
        return new Promise<IteratorResult<JobEvent>>((resolve) => {
          this.resolvers.push(resolve);
        });
      },
      return: (): Promise<IteratorResult<JobEvent>> => {
        // Consumer bailed (client disconnected) — close so the producer can stop.
        this.close();
        return Promise.resolve({ value: undefined as unknown as JobEvent, done: true });
      },
    };
  }
}

/**
 * Serialize a JobEvent into a Server-Sent Events frame. We use the `event.type` as
 * the SSE `event:` field so a client could selectively listen, and JSON in `data:`.
 * Trailing blank line terminates the frame per the SSE spec.
 */
export function toSSE(event: JobEvent): string {
  const data = JSON.stringify(event);
  return `event: ${event.type}\ndata: ${data}\n\n`;
}

/** An SSE comment line, used as a keep-alive heartbeat so proxies don't time out. */
export function sseComment(text = 'ping'): string {
  return `: ${text}\n\n`;
}
