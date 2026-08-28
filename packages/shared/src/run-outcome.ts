import type { RunStatus } from "./constants.js";

/**
 * What a run list shows as "the status": `runs.status` folded together with
 * the comparison results. `runs.status` alone only says whether the worker
 * got through the run - a `done` run can still have caught a visual
 * regression, and showing it as "done" next to a red failed count read as a
 * contradiction. So there is one outcome per run:
 *
 * - `queued` / `running` - the worker isn't through yet
 * - `failed` - the worker errored, some captures failed, or any comparison
 *   came back `failed` (an approved diff no longer counts - approving is how
 *   a failure is accepted, and the run then reads as passed)
 * - `passed` - the worker got through and nothing failed
 *
 * Every place that decides "did this run fail" - the web's pills, the
 * /projects outcome filter, the runs timeline, and the worker's
 * e-mail notification rule - goes through this function (CLAUDE.md §9: no
 * second "did it fail" rule). It lives in shared for exactly that reason.
 */
export type RunOutcome = "queued" | "running" | "passed" | "failed";

export function runOutcome(status: RunStatus, hasFailedComparisons: boolean): RunOutcome {
  if (status === "queued" || status === "running") {
    return status;
  }
  return status === "failed" || hasFailedComparisons ? "failed" : "passed";
}
