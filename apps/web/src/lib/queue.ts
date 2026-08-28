import { Queue } from "bullmq";
import { createRedisConnection, RUN_QUEUE_NAME } from "@vrt/shared";

declare global {
  var __vrtRunQueue: Queue | undefined;
}

// Cached on globalThis so Next.js dev-mode module reloads don't open a new
// Redis connection on every request.
export function getRunQueue(): Queue {
  if (!globalThis.__vrtRunQueue) {
    globalThis.__vrtRunQueue = new Queue(RUN_QUEUE_NAME, {
      connection: createRedisConnection(),
      // Without retention, finished jobs accumulate in Redis forever. Keep a
      // count-based window (not `true`): lib/live/source.ts re-reads a job by
      // id when its `completed` event arrives, so the just-finished job must
      // still exist - count-based retention only evicts the oldest.
      defaultJobOptions: {
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      },
    });
  }
  return globalThis.__vrtRunQueue;
}
