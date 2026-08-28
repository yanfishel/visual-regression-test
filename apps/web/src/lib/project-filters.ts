import type { Project } from "@vrt/db";
import type { ProjectCardData } from "./project-cards.js";
import { runOutcome } from "./run-outcome.js";

export const PROJECT_FILTERS = ["passing", "failing", "no-runs"] as const;
export type ProjectOutcomeFilter = (typeof PROJECT_FILTERS)[number];

// The card's classification: the newest finished run's outcome (the one
// rule in lib/run-outcome.ts - a worker-errored run can have zero
// comparisons, so counts alone would read as passing).
export function classifyProjectOutcome(card: ProjectCardData): ProjectOutcomeFilter {
  if (!card.lastFinishedRun) {
    return "no-runs";
  }
  const outcome = runOutcome(card.lastFinishedRun.status, (card.lastResult?.failed ?? 0) > 0);
  return outcome === "failed" ? "failing" : "passing";
}

export function filterProjects(
  projects: Project[],
  cardData: Map<string, ProjectCardData>,
  { query, filter }: { query: string; filter: ProjectOutcomeFilter | null },
): Project[] {
  const needle = query.trim().toLowerCase();
  return projects.filter((project) => {
    if (
      needle &&
      !project.name.toLowerCase().includes(needle) &&
      !project.baseUrl.toLowerCase().includes(needle)
    ) {
      return false;
    }
    if (filter) {
      const card = cardData.get(project.id);
      if (!card || classifyProjectOutcome(card) !== filter) {
        return false;
      }
    }
    return true;
  });
}

export function parseProjectFilter(value: unknown): ProjectOutcomeFilter | null {
  return typeof value === "string" && (PROJECT_FILTERS as readonly string[]).includes(value)
    ? (value as ProjectOutcomeFilter)
    : null;
}
