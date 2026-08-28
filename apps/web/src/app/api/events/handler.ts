// Relative, not the `@/` alias: this module is reachable from a vitest test,
// and vitest has no alias configuration.
import type { LiveEvent } from "@vrt/shared/schemas";
import type { LiveBroker } from "../../../lib/live/broker.js";
import { formatSseFrame, SSE_HEADERS, SSE_KEEP_ALIVE } from "../../../lib/live/sse.js";

export interface EventStreamDeps {
  broker: Pick<LiveBroker, "subscribe">;
  loadSnapshot: () => Promise<LiveEvent>;
  // null = this connection must not see the frame. Also applied to the
  // snapshot, which it narrows rather than drops.
  filter?: (event: LiveEvent) => LiveEvent | null;
  keepAliveMs?: number;
}

const DEFAULT_KEEP_ALIVE_MS = 20_000;

// A request that never gets a live stream - either it was already gone
// before we started, or the snapshot failed to load. No body, so there is
// nothing left to close on the client side.
function emptyResponse(init?: ResponseInit): Response {
  return new Response(null, init);
}

export async function createEventStreamResponse(
  deps: EventStreamDeps,
  signal: AbortSignal,
): Promise<Response> {
  // An already-fired abort event never calls a listener added afterwards, so
  // a signal aborted before this function even runs must bail out before
  // subscribing - otherwise the subscription below would never be paired
  // with its teardown.
  if (signal.aborted) {
    return emptyResponse({ headers: SSE_HEADERS });
  }

  // Subscribed synchronously, before the first `await`, with the abort
  // listener registered right next to it: there is no window where a
  // subscription exists without its teardown wired up, and no window where
  // an event published while the snapshot is loading (below) is dropped.
  // Events that arrive before the stream exists are buffered, in order, and
  // flushed right after the snapshot frame once it does.
  const buffered: LiveEvent[] = [];
  let sendLive: ((event: LiveEvent) => void) | undefined;
  const unsubscribe = deps.broker.subscribe((event) => {
    const scoped = deps.filter ? deps.filter(event) : event;
    if (!scoped) {
      return;
    }
    if (sendLive) {
      sendLive(scoped);
    } else {
      buffered.push(scoped);
    }
  });

  let controllerRef: ReadableStreamDefaultController<Uint8Array> | undefined;
  let keepAlive: ReturnType<typeof setInterval> | undefined;
  let cleanedUp = false;
  const cleanup = (): void => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    unsubscribe();
    if (keepAlive) {
      clearInterval(keepAlive);
    }
  };

  signal.addEventListener("abort", () => {
    cleanup();
    try {
      controllerRef?.close();
    } catch {
      // Already closed.
    }
  });

  let snapshot: LiveEvent;
  try {
    snapshot = await deps.loadSnapshot();
  } catch (error) {
    // Headers haven't been sent yet at this point, so this can still be a
    // real 503 instead of a 200 stream that silently never emits anything -
    // which is what EventSource's reconnect loop would otherwise hammer
    // every few seconds against a Redis that's still down.
    console.error("Failed to load live snapshot:", error);
    cleanup();
    return emptyResponse({ status: 503 });
  }
  if (deps.filter) {
    const filtered = deps.filter(snapshot);
    if (filtered) {
      snapshot = filtered;
    } else if (snapshot.type === "snapshot") {
      // Fail closed: a null verdict means this connection must not see any
      // of the snapshot's data. Falling back to the *unfiltered* snapshot
      // (the previous behavior) would leak it to a connection the filter
      // explicitly rejected - unreachable today (the only real filter,
      // createEventScope, always narrows a snapshot's runs in place rather
      // than returning null for it), but this keeps the failure mode safe
      // if that ever changes. Queue counts are operational, not per-user,
      // so they're kept; the run list is emptied instead of leaked.
      snapshot = { type: "snapshot", queue: snapshot.queue, runs: [] };
    }
  }

  if (signal.aborted) {
    // The client went away while the snapshot was loading; the abort
    // listener registered above already ran cleanup().
    return emptyResponse({ headers: SSE_HEADERS });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
      const send = (chunk: string): void => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // The client went away between the event firing and this write.
        }
      };

      send(formatSseFrame(snapshot));
      // Flush, in order, whatever arrived while the snapshot was loading.
      for (const event of buffered) {
        send(formatSseFrame(event));
      }
      buffered.length = 0;
      sendLive = (event) => send(formatSseFrame(event));

      keepAlive = setInterval(() => send(SSE_KEEP_ALIVE), deps.keepAliveMs ?? DEFAULT_KEEP_ALIVE_MS);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
