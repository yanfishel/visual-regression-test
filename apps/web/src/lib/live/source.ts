import type { LiveEvent, LiveQueueState, LiveRunState } from "@vrt/shared/schemas";
import { db } from "@vrt/db";
import { getRunQueue } from "@/lib/queue";
import { buildQueueState, buildRunState } from "./snapshot";
import { countLiveWorkers } from "./workers";

export async function loadQueueState(): Promise<LiveQueueState> {
  const queue = getRunQueue();
  const [counts, workers] = await Promise.all([
    queue.getJobCounts("waiting", "active"),
    // Heartbeat keys, not BullMQ's getWorkers(): that one reads Redis'
    // CLIENT LIST, so a worker whose event loop is wedged still counts as
    // online. Reuses the queue's own connection rather than opening a second
    // one per web process.
    queue.client.then(countLiveWorkers),
  ]);
  return buildQueueState(counts, workers);
}

// A BullMQ event only carries a job id. The run row is the source of truth for
// status, so read it rather than mapping job states to run states in a second
// place.
export async function loadRunStateByJobId(jobId: string): Promise<LiveRunState | null> {
  const job = await getRunQueue().getJob(jobId);
  const runId = typeof job?.data?.runId === "string" ? job.data.runId : null;
  if (!runId) {
    return null;
  }

  const run = await db.query.runs.findFirst({ where: (row, { eq }) => eq(row.id, runId) });
  return run ? buildRunState(run, job?.progress) : null;
}

export async function loadSnapshotEvent(): Promise<LiveEvent> {
  const queue = await loadQueueState();

  // Only unfinished runs are interesting live; anything else the page already
  // renders from Postgres.
  const activeRuns = await db.query.runs.findMany({
    where: (row, { inArray: within }) => within(row.status, ["queued", "running"]),
    orderBy: (row, { desc: newestFirst }) => newestFirst(row.createdAt),
    limit: 20,
  });

  const jobs = await getRunQueue().getJobs(["waiting", "active"]);
  const progressByRunId = new Map(
    jobs
      .filter((job) => typeof job.data?.runId === "string")
      .map((job) => [job.data.runId as string, job.progress] as const),
  );

  return {
    type: "snapshot",
    queue,
    runs: activeRuns.map((run) => buildRunState(run, progressByRunId.get(run.id))),
  };
}
