import { WORKER_HEARTBEAT_KEY_PATTERN } from "@vrt/shared/worker-heartbeat";

// Only SCAN, so the counting is testable without a Redis. The structured
// options object (rather than ioredis' positional tokens) is the shape
// BullMQ's client adapter declares - see IRedisClient.
export interface HeartbeatScanner {
  scan(cursor: string, options: { MATCH?: string; COUNT?: number }): Promise<[string, string[]]>;
}

// One round trip per ~100 keys; realistic installs have one worker, so this
// is a single SCAN that returns a single key.
const SCAN_PAGE_SIZE = 100;

/**
 * How many workers have refreshed their heartbeat recently enough for the key
 * to still exist. Replaces BullMQ's `getWorkers()`, which counts Redis
 * connections and so reports a wedged worker as online.
 */
export async function countLiveWorkers(redis: HeartbeatScanner): Promise<number> {
  // SCAN gives no set semantics - the same key can come back on two pages
  // while the keyspace changes under the cursor - so the keys are collected
  // rather than the page sizes summed.
  const keys = new Set<string>();
  let cursor = "0";
  do {
    const [next, page] = await redis.scan(cursor, {
      MATCH: WORKER_HEARTBEAT_KEY_PATTERN,
      COUNT: SCAN_PAGE_SIZE,
    });
    for (const key of page) {
      keys.add(key);
    }
    cursor = next;
  } while (cursor !== "0");

  return keys.size;
}
