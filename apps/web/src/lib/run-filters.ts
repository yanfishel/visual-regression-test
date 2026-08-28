import type { Run } from "@vrt/db";
import type { ComparisonCounts } from "./run-comparison-counts.js";
import { runOutcome } from "./run-outcome.js";

// The project run table's outcome filter: the two finished outcomes. Pending
// runs (queued/running) only ever show unfiltered - they have no verdict yet.
export const RUN_FILTERS = ["failed", "passed"] as const;
export type RunOutcomeFilter = (typeof RUN_FILTERS)[number];

export function filterRuns<T extends Pick<Run, "id" | "status">>(
  runs: T[],
  comparisonCounts: Map<string, ComparisonCounts>,
  filter: RunOutcomeFilter | null,
): T[] {
  if (!filter) {
    return runs;
  }
  return runs.filter(
    (run) => runOutcome(run.status, (comparisonCounts.get(run.id)?.failed ?? 0) > 0) === filter,
  );
}

export function parseRunFilter(value: unknown): RunOutcomeFilter | null {
  return typeof value === "string" && (RUN_FILTERS as readonly string[]).includes(value)
    ? (value as RunOutcomeFilter)
    : null;
}
