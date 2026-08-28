import type { ProjectOutcomeFilter } from "./project-filters.js";

/** The dropdown's entries: every outcome plus the "no filter" one. */
export type ProjectFilterOption = ProjectOutcomeFilter | "all";

// One place deciding how an outcome filter reads and looks, so the trigger,
// the option list and the tooltip can't drift apart. A plain module (not a
// "use client" file) - see lib/query-params.ts for why that matters.

export const PROJECT_FILTER_LABEL: Record<ProjectFilterOption, string> = {
  all: "All projects",
  passing: "Passing",
  failing: "Failing",
  "no-runs": "No runs",
};

export const PROJECT_FILTER_DOT_CLASS: Record<ProjectFilterOption, string> = {
  all: "bg-accent",
  passing: "bg-success",
  failing: "bg-danger",
  "no-runs": "bg-text-faint",
};
