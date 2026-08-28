import type { Run } from "@vrt/db";

/**
 * Wall time the worker spent on a run, in whole seconds - null until it has
 * both started and finished. A run that failed at enqueue time is finished
 * but never started; there is nothing to measure for it.
 */
export function runDurationSeconds(run: Pick<Run, "startedAt" | "finishedAt">): number | null {
  if (!run.startedAt || !run.finishedAt) {
    return null;
  }
  // The two timestamps are written by separate updates; a skewed clock must
  // not surface as a negative duration.
  return Math.max(0, Math.round((run.finishedAt.getTime() - run.startedAt.getTime()) / 1000));
}

// "42s" for the common case; a run over a minute (a large project, a slow
// site) reads better split than as "312s".
export function formatRunDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m ${rest}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${rest}s`;
  }
  return `${rest}s`;
}
