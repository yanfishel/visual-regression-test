import { Queue } from "bullmq";
import { and, inArray } from "drizzle-orm";
import { createRedisConnection, RUN_QUEUE_NAME, runJobDataSchema } from "@vrt/shared";
import { db, runs } from "@vrt/db";
import { notifyRunFinished } from "./notify.js";

// A run inserted moments ago may legitimately have no queue job yet (the web
// action inserts the row, then enqueues) - only runs older than this can be
// declared orphaned.
const MIN_ORPHAN_AGE_MS = 60_000;

export function findOrphanedRunIds(
  candidateRuns: readonly { id: string; createdAt: Date }[],
  runIdsWithJobs: ReadonlySet<string>,
): string[] {
  const cutoff = Date.now() - MIN_ORPHAN_AGE_MS;
  return candidateRuns
    .filter((run) => run.createdAt.getTime() < cutoff && !runIdsWithJobs.has(run.id))
    .map((run) => run.id);
}

// A worker killed mid-run (docker stop's SIGKILL, a crash) leaves its run
// `running` with no job behind it once BullMQ gives up on the stalled job -
// and a run enqueued while Redis was losing data can sit `queued` forever.
// Nothing else ever cleans those up, so the worker sweeps them at startup.
export async function reconcileStuckRuns(): Promise<void> {
  const candidates = await db.query.runs.findMany({
    where: inArray(runs.status, ["queued", "running"]),
    columns: { id: true, createdAt: true },
  });
  if (candidates.length === 0) {
    return;
  }

  const queue = new Queue(RUN_QUEUE_NAME, { connection: createRedisConnection() });
  try {
    const jobs = await queue.getJobs(["waiting", "active", "delayed", "paused", "prioritized"]);
    const runIdsWithJobs = new Set<string>();
    for (const job of jobs) {
      const parsed = runJobDataSchema.safeParse(job?.data);
      if (parsed.success) {
        runIdsWithJobs.add(parsed.data.runId);
      }
    }

    const orphaned = findOrphanedRunIds(candidates, runIdsWithJobs);
    if (orphaned.length === 0) {
      return;
    }

    await db
      .update(runs)
      .set({
        status: "failed",
        finishedAt: new Date(),
        error: "Run had no queue job at worker startup (worker likely died mid-run or the queue was lost)",
      })
      .where(and(inArray(runs.id, orphaned), inArray(runs.status, ["queued", "running"])));
    console.log(`Reconciled ${orphaned.length} stuck run(s) at startup: ${orphaned.join(", ")}`);
    // A lost scheduled run is a failed scheduled run - tell the owner the
    // same way the processor would have.
    for (const runId of orphaned) {
      await notifyRunFinished(runId);
    }
  } finally {
    await queue.close();
  }
}
