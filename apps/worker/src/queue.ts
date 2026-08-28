import { Worker } from "bullmq";
import { createRedisConnection, RUN_QUEUE_NAME, runJobDataSchema } from "@vrt/shared";
import { processRun } from "./run-processor.js";

export function startWorker(): Worker {
  const worker = new Worker(
    RUN_QUEUE_NAME,
    async (job) => {
      const { runId } = runJobDataSchema.parse(job.data);
      // BullMQ publishes every updateProgress call to Redis, which is what the
      // web process's QueueEvents subscription turns into an SSE event.
      await processRun(runId, (progress) => {
        // Progress publishing is best-effort: a transient Redis failure must
        // not kill the run, and an unhandled rejection would kill the process.
        void job.updateProgress(progress).catch((error) => {
          console.error(`Failed to publish progress for run ${runId}:`, error);
        });
      });
    },
    {
      connection: createRedisConnection(),
      // One Chromium instance at a time - concurrent runs would fight over
      // CPU and make timing-sensitive stabilization (§5) less reliable.
      concurrency: 1,
    },
  );

  worker.on("completed", (job) => console.log(`Run ${job.data.runId} completed`));
  worker.on("failed", (job, error) => console.error(`Run ${job?.data?.runId ?? "?"} failed:`, error));

  return worker;
}
