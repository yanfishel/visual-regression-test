import type { RunOutcomeFilter } from "./run-filters.js";

/** The dropdown's entries: both finished outcomes plus the "no filter" one. */
export type RunFilterOption = RunOutcomeFilter | "all";

// One place deciding how the run filter reads and looks (twin of
// lib/project-filter-display.ts). A plain module, not a "use client" file -
// see lib/query-params.ts for why that matters.

export const RUN_FILTER_LABEL: Record<RunFilterOption, string> = {
  all: "All runs",
  failed: "Failed",
  passed: "Passed",
};

export const RUN_FILTER_DOT_CLASS: Record<RunFilterOption, string> = {
  all: "bg-accent",
  failed: "bg-danger",
  passed: "bg-success",
};
