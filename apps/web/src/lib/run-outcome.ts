// The outcome rule itself lives in @vrt/shared/run-outcome so the worker's
// e-mail notifications apply the very same "did this run fail" definition
// as every pill and filter here. Only the pill classes are web-specific.
export { runOutcome, type RunOutcome } from "@vrt/shared/run-outcome";
import type { RunOutcome } from "@vrt/shared/run-outcome";

// Pill class per outcome - rendered through `RunOutcomePill`
// (components/run-outcome-pill.tsx) everywhere a run's outcome shows: the
// project run table, the recent-runs sidebar, project cards, the run page.
export const RUN_OUTCOME_CLASS: Record<RunOutcome, string> = {
  queued: "pill-queued",
  running: "pill-running",
  passed: "pill-passed",
  failed: "pill-failed",
};
