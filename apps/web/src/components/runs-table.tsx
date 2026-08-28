import type { Run } from "@vrt/db";
import type { CaptureCounts } from "@/lib/run-capture-counts";
import type { ComparisonCounts } from "@/lib/run-comparison-counts";
import { formatRunDuration, runDurationSeconds } from "@/lib/run-duration";
import { describeRunFailure } from "@/lib/run-failure-details";
import { runOutcome } from "@/lib/run-outcome";
import { LocalTime } from "./local-time";
import { RunOutcomePill } from "./run-outcome-pill";
import { RunRow } from "./run-row";
import { RunTrigger } from "./run-trigger";

const HEADER_CELL = "px-4 py-2 font-bold";
const FIGURE_CELL = "px-4 py-2.5 text-right font-mono text-xs tabular-nums";

// The project page's run history: when a run started (viewer's local time),
// how it was triggered, how long the worker took, how many page/viewport
// pairs it captured, how its comparisons came out and its outcome. Each row
// opens its run (`RunRow`), so no cell needs to be a link. Figures are
// right-aligned monospace so the columns scan; the failed count and a short
// capture are the figures that matter, so they are the only loud ones in a
// row.
export function RunsTable({
  projectId,
  runs,
  captureCounts,
  comparisonCounts,
  emptyMessage = "No runs yet.",
}: {
  projectId: string;
  runs: Run[];
  captureCounts: Map<string, CaptureCounts>;
  comparisonCounts: Map<string, ComparisonCounts>;
  /** Shown instead of the table when `runs` is empty - "no runs" vs "none match the filter". */
  emptyMessage?: string;
}) {
  if (runs.length === 0) {
    return <p className="panel mt-3 px-4 py-3 text-text-muted">{emptyMessage}</p>;
  }

  return (
    // Eight columns don't fit a phone; the table scrolls inside the panel
    // rather than widening the page.
    <div className="panel mt-3 overflow-x-auto">
      <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
        <thead>
          <tr className="text-xs font-bold uppercase tracking-wide text-text-faint">
            <th className={HEADER_CELL}>Started</th>
            <th className={HEADER_CELL}>Trigger</th>
            <th className={`${HEADER_CELL} text-right`}>Duration</th>
            <th className={`${HEADER_CELL} text-right`}>Captures</th>
            <th className={`${HEADER_CELL} text-right`}>Passed</th>
            <th className={`${HEADER_CELL} text-right`}>Failed</th>
            <th className={`${HEADER_CELL} text-right`}>New</th>
            <th className={`${HEADER_CELL} text-right`}>Status</th>
          </tr>
        </thead>
        <tbody className="align-middle">
          {runs.map((run) => {
            // Nothing to measure or count until the worker is through with
            // the run - a dash reads better than a row of zeros that will
            // change in a moment.
            const finished = run.status === "done" || run.status === "failed";
            const duration = runDurationSeconds(run);
            const counts = comparisonCounts.get(run.id);
            const captures = captureCounts.get(run.id);
            const outcome = runOutcome(run.status, (counts?.failed ?? 0) > 0);
            // Why the pill says failed - failed diffs, a partial capture, a
            // worker error - goes in its tooltip.
            const details = describeRunFailure(run, counts?.failed ?? 0, captures);
            return (
              <RunRow key={run.id} href={`/projects/${projectId}/runs/${run.id}`}>
                <td className="px-4 py-2.5 font-medium">
                  <LocalTime date={run.createdAt} />
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-text-muted">
                  <RunTrigger trigger={run.trigger} />
                </td>
                <td className={`${FIGURE_CELL} text-text-muted`}>
                  {duration === null ? <Dash /> : formatRunDuration(duration)}
                </td>
                <CapturesCell counts={finished ? captures : undefined} />
                <Figure value={finished ? counts?.passed : undefined} className="text-text-muted" />
                <Figure value={finished ? counts?.failed : undefined} className="font-bold text-danger" />
                <Figure value={finished ? counts?.unreviewed : undefined} className="text-text-muted" />
                <td className="px-4 py-2.5 text-right">
                  <RunOutcomePill outcome={outcome} details={details} />
                </td>
              </RunRow>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// "captured / attempted": a partial capture (some pairs the worker couldn't
// shoot) reads red - the whole fraction, since the shortfall is the point.
// A dash while in flight, and for a run that never got to capture at all
// (worker crashed first) - there is nothing to count either way.
function CapturesCell({ counts }: { counts: CaptureCounts | undefined }) {
  const total = counts ? counts.captured + counts.failed : 0;
  if (!counts || total === 0) {
    return (
      <td className={`${FIGURE_CELL} text-text-faint`}>
        <Dash />
      </td>
    );
  }
  const short = counts.failed > 0;
  return (
    <td className={`${FIGURE_CELL} ${short ? "font-bold text-danger" : "text-text-muted"}`}>
      {counts.captured}/{total}
    </td>
  );
}

// A count cell: zero is quiet, a dash stands for "not yet", and `className`
// styles only a real nonzero figure.
function Figure({ value, className }: { value: number | undefined; className: string }) {
  return (
    <td className={`${FIGURE_CELL} ${value ? className : "text-text-faint"}`}>
      {value === undefined ? <Dash /> : value}
    </td>
  );
}

function Dash() {
  return <span aria-label="not available">—</span>;
}
