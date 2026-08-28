import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WORKER_HEARTBEAT_INTERVAL_MS, WORKER_HEARTBEAT_TTL_MS } from "@vrt/shared/worker-heartbeat";
import { startWorkerHeartbeat } from "./heartbeat.js";

interface RecordedWrite {
  key: string;
  value: string;
  mode: string;
  ttlMs: number;
}

function createFakeClient(failFirstWrites = 0) {
  const writes: RecordedWrite[] = [];
  const deleted: string[] = [];
  let failuresLeft = failFirstWrites;
  return {
    writes,
    deleted,
    async set(key: string, value: string, mode: "PX", ttlMs: number): Promise<string> {
      if (failuresLeft > 0) {
        failuresLeft -= 1;
        throw new Error("redis is down");
      }
      writes.push({ key, value, mode, ttlMs });
      return "OK";
    },
    async del(key: string): Promise<number> {
      deleted.push(key);
      return 1;
    },
  };
}

const KEY = "vrt:worker:host:42";

describe("startWorkerHeartbeat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-23T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("writes the key immediately, so a fresh worker shows up without waiting a beat", async () => {
    const client = createFakeClient();

    startWorkerHeartbeat({ client, instanceId: "host:42" });
    await vi.advanceTimersByTimeAsync(0);

    expect(client.writes).toEqual([
      { key: KEY, value: "2026-08-23T10:00:00.000Z", mode: "PX", ttlMs: WORKER_HEARTBEAT_TTL_MS },
    ]);
  });

  it("keeps refreshing the key on every interval", async () => {
    const client = createFakeClient();

    startWorkerHeartbeat({ client, instanceId: "host:42" });
    await vi.advanceTimersByTimeAsync(WORKER_HEARTBEAT_INTERVAL_MS * 2);

    expect(client.writes.map((write) => write.value)).toEqual([
      "2026-08-23T10:00:00.000Z",
      new Date(Date.parse("2026-08-23T10:00:00.000Z") + WORKER_HEARTBEAT_INTERVAL_MS).toISOString(),
      new Date(Date.parse("2026-08-23T10:00:00.000Z") + WORKER_HEARTBEAT_INTERVAL_MS * 2).toISOString(),
    ]);
  });

  it("logs a failed write and beats again on the next interval", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = createFakeClient(1);

    startWorkerHeartbeat({ client, instanceId: "host:42" });
    await vi.advanceTimersByTimeAsync(WORKER_HEARTBEAT_INTERVAL_MS);

    expect(errors).toHaveBeenCalledOnce();
    expect(client.writes).toHaveLength(1);
  });

  it("stops beating and removes the key, so a graceful stop shows offline at once", async () => {
    const client = createFakeClient();

    const stop = startWorkerHeartbeat({ client, instanceId: "host:42" });
    await vi.advanceTimersByTimeAsync(0);
    await stop();
    await vi.advanceTimersByTimeAsync(WORKER_HEARTBEAT_INTERVAL_MS * 3);

    expect(client.deleted).toEqual([KEY]);
    expect(client.writes).toHaveLength(1);
  });
});
