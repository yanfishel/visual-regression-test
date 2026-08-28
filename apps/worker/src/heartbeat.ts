import { hostname } from "node:os";
import {
  createRedisConnection,
  workerHeartbeatKey,
  WORKER_HEARTBEAT_INTERVAL_MS,
  WORKER_HEARTBEAT_TTL_MS,
} from "@vrt/shared";

// Only the two commands the heartbeat needs, so tests can hand it a fake
// instead of a Redis.
export interface HeartbeatClient {
  set(key: string, value: string, mode: "PX", ttlMs: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

export interface HeartbeatOptions {
  client?: HeartbeatClient;
  instanceId?: string;
}

// Host plus pid: unique per process (two workers on one host still differ),
// stable across a process's life, and readable in `redis-cli keys`.
export function workerInstanceId(): string {
  return `${hostname()}:${process.pid}`;
}

/**
 * Publish this process's liveness as a Redis key that expires unless it is
 * refreshed - see the shared constants for why an expiring key beats counting
 * connections. Returns a stop function that clears the key, so a graceful
 * shutdown reads as offline at once rather than after the TTL.
 */
export function startWorkerHeartbeat(options: HeartbeatOptions = {}): () => Promise<void> {
  const client = options.client ?? createRedisConnection();
  const key = workerHeartbeatKey(options.instanceId ?? workerInstanceId());

  const beat = (): void => {
    // Best-effort, like the other periodic worker tasks: a transient Redis
    // failure must not kill the process, and a missed beat self-corrects on
    // the next one as long as the TTL hasn't elapsed.
    void client.set(key, new Date().toISOString(), "PX", WORKER_HEARTBEAT_TTL_MS).catch((error) => {
      console.error("Failed to write the worker heartbeat:", error);
    });
  };

  beat();
  const timer = setInterval(beat, WORKER_HEARTBEAT_INTERVAL_MS);
  timer.unref();

  return async (): Promise<void> => {
    clearInterval(timer);
    try {
      await client.del(key);
    } catch (error) {
      console.error("Failed to clear the worker heartbeat:", error);
    }
  };
}
