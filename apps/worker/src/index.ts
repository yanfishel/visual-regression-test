import { startWorkerHeartbeat } from "./heartbeat.js";
import { startWorker } from "./queue.js";
import { reconcileStuckRuns } from "./reconcile.js";
import { startRetentionSweeps } from "./retention.js";
import { startScheduleTicks } from "./scheduler.js";

const worker = startWorker();
console.log(`VRT worker listening on queue "${worker.name}"...`);

// Sweep runs stranded by a previous worker death before taking new work -
// see reconcile.ts. Best-effort: a failed sweep shouldn't stop the worker.
reconcileStuckRuns().catch((error) => {
  console.error("Startup run reconciliation failed:", error);
});

// CLAUDE.md section 7 retention: once at startup, then daily.
startRetentionSweeps();

// Project schedules: one pass now, then every 60 seconds (see scheduler.ts).
startScheduleTicks();

// Liveness for the web app's worker indicator: a Redis key this process has
// to keep refreshing (heartbeat.ts).
const stopHeartbeat = startWorkerHeartbeat();

// docker stop sends SIGKILL after ~10s, and worker.close() waits for the
// active job - a full run takes minutes. Force-exit just before the SIGKILL
// deadline so the exit is at least logged; the interrupted run is picked up
// by reconcileStuckRuns on the next start.
const FORCE_EXIT_AFTER_MS = 8_000;

async function shutdown(): Promise<void> {
  // Before draining the active job, which takes minutes: the UI should say
  // "offline" from the moment the worker is on its way out.
  await stopHeartbeat();

  const force = setTimeout(() => {
    console.error("Graceful shutdown timed out with a job still active - forcing exit");
    process.exit(1);
  }, FORCE_EXIT_AFTER_MS);
  force.unref();

  await worker.close();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
