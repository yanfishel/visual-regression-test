import type { Run } from "@vrt/db";
import type { CaptureCounts } from "./run-capture-counts.js";

/**
 * Why a run's outcome is `failed`, one line per reason, for the pill's
 * tooltip: failed comparisons first (the thing this tool exists to catch),
 * then what went wrong on the worker's side - a partial capture from the
 * counts when the caller has them, otherwise `runs.error` (which for a
 * partial capture holds the same "N of M captures failed" text the worker
 * wrote, and for a worker-level failure the raw message). Empty for a run
 * that did not fail.
 */
export function describeRunFailure(
  run: Pick<Run, "status" | "error">,
  failedComparisons: number,
  captureCounts?: CaptureCounts,
): string[] {
  const lines: string[] = [];
  if (failedComparisons > 0) {
    lines.push(`${failedComparisons} comparison${failedComparisons === 1 ? "" : "s"} failed`);
  }
  if (captureCounts && captureCounts.failed > 0) {
    lines.push(`${captureCounts.failed} of ${captureCounts.captured + captureCounts.failed} captures failed`);
  } else if (run.status === "failed") {
    lines.push(run.error ? `Run failed: ${summarizeError(run.error)}` : "Run failed");
  }
  return lines;
}

const ERROR_SUMMARY_LENGTH = 140;

// A tooltip line, not a log dump: runs from before capture failures were
// structured hold a `; `-joined blob of Playwright messages, ANSI escapes
// included, in `error`. Strip the escapes, flatten whitespace and cut - the
// run page shows the whole thing.
export function summarizeError(error: string): string {
  const flat = error
    // eslint-disable-next-line no-control-regex -- ANSI SGR sequences
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > ERROR_SUMMARY_LENGTH ? `${flat.slice(0, ERROR_SUMMARY_LENGTH - 1).trimEnd()}…` : flat;
}
