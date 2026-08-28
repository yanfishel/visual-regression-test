import type { LiveRunState } from "@vrt/shared/schemas";

// A long-lived tab receives run events forever, and the LiveProvider map
// would otherwise grow by one entry per run with nothing ever evicting them
// (a snapshot resets it, but only on connect/reconnect). Finished runs are
// described by Postgres through the server components, so terminal entries -
// except the one an event just delivered, which useLiveRun consumers may
// still be rendering - are dropped on every run event.
export function pruneTerminalRuns(
  runs: Record<string, LiveRunState>,
  keepRunId: string,
): Record<string, LiveRunState> {
  const pruned: Record<string, LiveRunState> = {};
  for (const [runId, run] of Object.entries(runs)) {
    const terminal = run.status === "done" || run.status === "failed";
    if (!terminal || runId === keepRunId) {
      pruned[runId] = run;
    }
  }
  return pruned;
}
