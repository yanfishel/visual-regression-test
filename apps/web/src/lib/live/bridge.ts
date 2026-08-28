import { QueueEvents } from "bullmq";
import { createRedisConnection, RUN_QUEUE_NAME } from "@vrt/shared";
import type { LiveQueueState } from "@vrt/shared/schemas";
import { getLiveBroker } from "./broker";
import { hasQueueChanged } from "./queue-changes";
import { loadQueueState, loadRunStateByJobId } from "./source";

// A worker heartbeat expiring is a non-event: Redis announces nothing when a
// key's TTL runs out, and a dead worker produces no BullMQ events either. So
// the queue state is re-read on a timer as well, which is what makes the
// header indicator go red on its own within a heartbeat TTL of the worker
// dying instead of at the next page load.
const QUEUE_POLL_MS = 5_000;

declare global {
  var __vrtLiveBridge: QueueEvents | undefined;
}

// One QueueEvents subscription per web process, cached on globalThis so a
// dev-mode module reload doesn't leave a second Redis subscriber behind.
export function ensureLiveBridge(): void {
  if (globalThis.__vrtLiveBridge) {
    return;
  }

  const events = new QueueEvents(RUN_QUEUE_NAME, { connection: createRedisConnection() });
  globalThis.__vrtLiveBridge = events;

  const broker = getLiveBroker();

  const publishRun = (jobId: string): void => {
    void loadRunStateByJobId(jobId)
      .then((run) => {
        if (run) {
          broker.publish({ type: "run", run });
        }
      })
      .catch((error) => console.error("Failed to publish run state:", error));
  };

  // Every poll would otherwise wake every open SSE connection, so a frame
  // goes out only when a figure actually moved.
  let lastQueue: LiveQueueState | null = null;
  const publishQueue = (): void => {
    void loadQueueState()
      .then((queue) => {
        if (!hasQueueChanged(lastQueue, queue)) {
          return;
        }
        lastQueue = queue;
        broker.publish({ type: "queue", queue });
      })
      .catch((error) => console.error("Failed to publish queue state:", error));
  };

  for (const name of ["waiting", "active", "completed", "failed"] as const) {
    events.on(name, ({ jobId }: { jobId: string }) => {
      publishRun(jobId);
      publishQueue();
    });
  }

  // Progress fires often and never changes queue depth - publish the run only.
  events.on("progress", ({ jobId }: { jobId: string }) => publishRun(jobId));

  events.on("error", (error) => console.error("Live bridge error:", error));

  const poll = setInterval(publishQueue, QUEUE_POLL_MS);
  poll.unref();
}
