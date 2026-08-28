import Link from "next/link";
import type { RecentRun } from "@/lib/recent-runs";
import { describeCaptureCounts, type CaptureCounts } from "@/lib/run-capture-counts";
import type { ComparisonCounts } from "@/lib/run-comparison-counts";
import { describeRunFailure } from "@/lib/run-failure-details";
import { runOutcome } from "@/lib/run-outcome";
import { WorkerStatus } from "./live/worker-status";
import { LocalTime } from "./local-time";
import { RunOutcomePill } from "./run-outcome-pill";
import { RunTrigger } from "./run-trigger";

export function RecentRunsPanel({
  runs,
  captureCounts,
  comparisonCounts,
}: {
  runs: RecentRun[];
  captureCounts: Map<string, CaptureCounts>;
  comparisonCounts: Map<string, ComparisonCounts>;
}) {
  return (
    <div className="panel">
      <div className="border-b border-border px-5 pb-3 pt-4">
        <h3 className="text-sm font-bold">Recent runs</h3>
      </div>
      {runs.length === 0 && <p className="px-5 py-4 text-sm text-text-muted">No runs yet.</p>}
      {runs.map((run) => {
        // "3/6 captures failed" tells a partial capture apart from a run the
        // worker itself crashed on - both wear the same failed pill.
        const captures = captureCounts.get(run.id);
        const captureNote = describeCaptureCounts(captures);
        const failedComparisons = comparisonCounts.get(run.id)?.failed ?? 0;
        const outcome = runOutcome(run.status, failedComparisons > 0);
        const details = describeRunFailure(run, failedComparisons, captures);
        return (
          <Link
            key={run.id}
            href={`/projects/${run.projectId}/runs/${run.id}`}
            className="flex flex-col gap-1 border-b border-border px-5 py-3 last:border-b-0 hover:bg-surface-alt"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-sm font-semibold">{run.projectName}</span>
              <RunOutcomePill outcome={outcome} details={details} className="shrink-0" />
            </div>
            <div className="flex items-center gap-1.5 font-mono text-xs text-text-faint">
              <RunTrigger trigger={run.trigger} />
              <span>&middot;</span>
              <LocalTime date={run.createdAt} />
            </div>
            {captureNote && <span className="font-mono text-xs text-danger">{captureNote}</span>}
          </Link>
        );
      })}
    </div>
  );
}

export function WorkerStatusPanel() {
  return (
    <div className="panel p-5">
      <WorkerStatus />
    </div>
  );
}
