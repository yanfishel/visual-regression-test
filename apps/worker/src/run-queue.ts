import { Queue } from "bullmq";
import { createRedisConnection, RUN_QUEUE_NAME } from "@vrt/shared";

let queue: Queue | null = null;

// The worker's first write side. Scheduled runs go through BullMQ exactly
// like the Run button's, because the web process's QueueEvents subscription
// is what turns a job into a live SSE update - see CLAUDE.md §8/§9. The job
// options mirror apps/web/src/lib/queue.ts so retention doesn't depend on
// which process enqueued.
export function getRunQueue(): Queue {
  queue ??= new Queue(RUN_QUEUE_NAME, {
    connection: createRedisConnection(),
    defaultJobOptions: {
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  });
  return queue;
}
