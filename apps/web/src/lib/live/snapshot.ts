import { runProgressSchema, type LiveQueueState, type LiveRunState } from "@vrt/shared/schemas";
import type { Run } from "@vrt/db";

export function buildQueueState(
  counts: { waiting?: number; active?: number },
  workerCount: number,
): LiveQueueState {
  return {
    waiting: counts.waiting ?? 0,
    active: counts.active ?? 0,
    workersOnline: workerCount,
  };
}

// The run row is the source of truth for status; BullMQ only contributes the
// transient progress, which is `unknown` as far as its types go.
export function buildRunState(
  run: Pick<Run, "id" | "projectId" | "status">,
  progress: unknown,
): LiveRunState {
  const parsed = runProgressSchema.safeParse(progress);
  return {
    runId: run.id,
    projectId: run.projectId,
    status: run.status,
    progress: parsed.success ? parsed.data : null,
  };
}
