import { afterEach, describe, expect, it, vi } from "vitest";
import type { LiveEvent } from "@vrt/shared/schemas";
import { LiveBroker } from "../../../lib/live/broker.js";
import { SSE_KEEP_ALIVE } from "../../../lib/live/sse.js";
import { createEventStreamResponse } from "./handler.js";

const SNAPSHOT: LiveEvent = {
  type: "snapshot",
  queue: { waiting: 0, active: 0, workersOnline: 1 },
  runs: [],
};

const QUEUE_EVENT: LiveEvent = {
  type: "queue",
  queue: { waiting: 1, active: 0, workersOnline: 1 },
};

const OTHER_QUEUE_EVENT: LiveEvent = {
  type: "queue",
  queue: { waiting: 2, active: 1, workersOnline: 1 },
};

async function readFrame(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const { value } = await reader.read();
  return new TextDecoder().decode(value);
}

describe("createEventStreamResponse", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sets the SSE headers", async () => {
    const response = await createEventStreamResponse(
      { broker: new LiveBroker(), loadSnapshot: async () => SNAPSHOT },
      new AbortController().signal,
    );
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
  });

  it("sends the snapshot first, then broker events", async () => {
    const broker = new LiveBroker();
    const response = await createEventStreamResponse(
      { broker, loadSnapshot: async () => SNAPSHOT },
      new AbortController().signal,
    );
    const reader = response.body!.getReader();

    expect(await readFrame(reader)).toContain(`"type":"snapshot"`);

    broker.publish(QUEUE_EVENT);
    expect(await readFrame(reader)).toContain(`"type":"queue"`);
  });

  it("unsubscribes when the request is aborted", async () => {
    const broker = new LiveBroker();
    const controller = new AbortController();
    const response = await createEventStreamResponse(
      { broker, loadSnapshot: async () => SNAPSHOT },
      controller.signal,
    );
    const reader = response.body!.getReader();
    await readFrame(reader);

    controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(broker.subscriberCount).toBe(0);
  });

  it("never subscribes when the signal is already aborted", async () => {
    const broker = new LiveBroker();
    const controller = new AbortController();
    controller.abort();

    await createEventStreamResponse({ broker, loadSnapshot: async () => SNAPSHOT }, controller.signal);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(broker.subscriberCount).toBe(0);
  });

  it("subscribes synchronously, before the snapshot resolves", () => {
    const broker = new LiveBroker();
    let resolveSnapshot: ((event: LiveEvent) => void) | undefined;
    const snapshotPromise = new Promise<LiveEvent>((resolve) => {
      resolveSnapshot = resolve;
    });

    void createEventStreamResponse(
      { broker, loadSnapshot: () => snapshotPromise },
      new AbortController().signal,
    );

    // No `await` above: this assertion runs before the snapshot promise has
    // a chance to resolve, proving the subscription exists during the
    // window an in-flight snapshot read is open.
    expect(broker.subscriberCount).toBe(1);
    resolveSnapshot!(SNAPSHOT);
  });

  it("buffers events published while the snapshot is loading and flushes them in order after it", async () => {
    const broker = new LiveBroker();
    let resolveSnapshot: ((event: LiveEvent) => void) | undefined;
    const snapshotPromise = new Promise<LiveEvent>((resolve) => {
      resolveSnapshot = resolve;
    });

    const responsePromise = createEventStreamResponse(
      { broker, loadSnapshot: () => snapshotPromise },
      new AbortController().signal,
    );

    // Published before the snapshot resolves: without buffering, this event
    // would be lost because the broker subscription's callback has nowhere
    // to send it yet.
    broker.publish(QUEUE_EVENT);
    broker.publish(OTHER_QUEUE_EVENT);
    resolveSnapshot!(SNAPSHOT);

    const response = await responsePromise;
    const reader = response.body!.getReader();

    expect(await readFrame(reader)).toContain(`"type":"snapshot"`);
    expect(await readFrame(reader)).toContain(`"waiting":1`);
    expect(await readFrame(reader)).toContain(`"waiting":2`);
  });

  it("unsubscribes if the request aborts while the snapshot is still loading", async () => {
    const broker = new LiveBroker();
    let resolveSnapshot: ((event: LiveEvent) => void) | undefined;
    const snapshotPromise = new Promise<LiveEvent>((resolve) => {
      resolveSnapshot = resolve;
    });
    const controller = new AbortController();

    const responsePromise = createEventStreamResponse(
      { broker, loadSnapshot: () => snapshotPromise },
      controller.signal,
    );

    expect(broker.subscriberCount).toBe(1);
    controller.abort();
    // Abort dispatch is synchronous, so cleanup already ran here.
    expect(broker.subscriberCount).toBe(0);

    resolveSnapshot!(SNAPSHOT);
    await responsePromise;
  });

  it("returns 503 without leaking a subscription when the snapshot load fails", async () => {
    const broker = new LiveBroker();
    // Expected: the route logs the failure instead of the request erroring
    // an already-sent 200 stream.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await createEventStreamResponse(
      {
        broker,
        loadSnapshot: async () => {
          throw new Error("redis unavailable");
        },
      },
      new AbortController().signal,
    );

    expect(response.status).toBe(503);
    expect(broker.subscriberCount).toBe(0);
    consoleError.mockRestore();
  });

  it("emits a keep-alive comment frame on the configured interval", async () => {
    vi.useFakeTimers();
    const broker = new LiveBroker();
    const response = await createEventStreamResponse(
      { broker, loadSnapshot: async () => SNAPSHOT, keepAliveMs: 1000 },
      new AbortController().signal,
    );
    const reader = response.body!.getReader();
    await readFrame(reader); // snapshot

    const framePromise = readFrame(reader);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await framePromise).toBe(SSE_KEEP_ALIVE);
  });

  it("clears the keep-alive interval when the request aborts, leaving no timer running", async () => {
    vi.useFakeTimers();
    const broker = new LiveBroker();
    const controller = new AbortController();
    const response = await createEventStreamResponse(
      { broker, loadSnapshot: async () => SNAPSHOT, keepAliveMs: 1000 },
      controller.signal,
    );
    const reader = response.body!.getReader();
    await readFrame(reader); // snapshot

    expect(vi.getTimerCount()).toBeGreaterThan(0);

    controller.abort();
    await vi.advanceTimersByTimeAsync(0);

    expect(vi.getTimerCount()).toBe(0);
  });
});
