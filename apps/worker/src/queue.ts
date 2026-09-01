import { Worker } from "bullmq";
import { createRedisConnection, RUN_QUEUE_NAME, runJobDataSchema } from "@vrt/shared";
import { DeadlineError, withDeadline } from "./deadline.js";
import { processRun } from "./run-processor.js";

// The backstop behind capture.ts's per-page deadline, for everything that
// file cannot time-box: a `browser.newContext()` that never returns, a
// storage write wedged on a full disk, a Postgres connection that hangs.
// Far past any real run (the production instance finishes in under two
// minutes) - this is not a "slow run" limit, it is a "this worker is never
// coming back" limit.
const RUN_DEADLINE_MS = 30 * 60 * 1000;

export function startWorker(): Worker {
  const worker = new Worker(
    RUN_QUEUE_NAME,
    async (job) => {
      const { runId } = runJobDataSchema.parse(job.data);
      // BullMQ publishes every updateProgress call to Redis, which is what the
      // web process's QueueEvents subscription turns into an SSE event.
      const run = processRun(runId, (progress) => {
        // Progress publishing is best-effort: a transient Redis failure must
        // not kill the run, and an unhandled rejection would kill the process.
        void job.updateProgress(progress).catch((error) => {
          console.error(`Failed to publish progress for run ${runId}:`, error);
        });
      });
      try {
        await withDeadline(run, RUN_DEADLINE_MS, `Run ${runId}`);
      } catch (error) {
        if (error instanceof DeadlineError) {
          // Exiting is the whole point, and nothing softer would do. By now
          // BullMQ's lock on this job has long expired and the queue counts
          // this worker as idle, while the abandoned processRun still owns
          // the only `concurrency: 1` slot - a slot no in-process cleanup can
          // hand back, since the work behind it cannot be cancelled
          // (deadline.ts). Docker's `restart: unless-stopped` brings the
          // worker back in seconds, and the run itself is ended properly by
          // the stalled-retry guard in run-processor.ts, exactly as it is for
          // any other worker death mid-run.
          console.error(`${error.message} - exiting so the worker restarts clean`);
          process.exit(1);
        }
        throw error;
      }
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
