import { count, inArray } from "drizzle-orm";
import { captureFailures, db, shots, type Database } from "@vrt/db";

export interface CaptureCounts {
  /** Shots the run produced. */
  captured: number;
  /** Page/viewport pairs it could not capture (capture_failures rows). */
  failed: number;
}

export interface RunCountRow {
  runId: string;
  count: number;
}

// Every requested run gets an entry, so list renderers can index without a
// zero-default at each call site.
export function toCaptureCounts(
  runIds: string[],
  shotCounts: RunCountRow[],
  failureCounts: RunCountRow[],
): Map<string, CaptureCounts> {
  const captured = new Map(shotCounts.map((row) => [row.runId, row.count]));
  const failed = new Map(failureCounts.map((row) => [row.runId, row.count]));
  return new Map(
    runIds.map((runId) => [runId, { captured: captured.get(runId) ?? 0, failed: failed.get(runId) ?? 0 }]),
  );
}

/**
 * The note the recent-runs sidebar shows under a `failed` pill: "3/6
 * captures failed" tells a partial capture apart from a run the worker
 * itself crashed on (which has no capture failures and therefore no note).
 * The project run table has a Captures column instead. The total is not
 * stored anywhere - it's what did capture plus what didn't.
 */
export function describeCaptureCounts(counts: CaptureCounts | undefined): string | null {
  if (!counts || counts.failed === 0) {
    return null;
  }
  return `${counts.failed}/${counts.captured + counts.failed} captures failed`;
}

/**
 * Two grouped queries for a whole run list, never one per row - the same
 * batching rule the project cards and the user table follow.
 */
export async function getCaptureCounts(
  runIds: string[],
  database: Database = db,
): Promise<Map<string, CaptureCounts>> {
  if (runIds.length === 0) {
    return new Map();
  }
  const [shotCounts, failureCounts] = await Promise.all([
    database
      .select({ runId: shots.runId, count: count() })
      .from(shots)
      .where(inArray(shots.runId, runIds))
      .groupBy(shots.runId),
    database
      .select({ runId: captureFailures.runId, count: count() })
      .from(captureFailures)
      .where(inArray(captureFailures.runId, runIds))
      .groupBy(captureFailures.runId),
  ]);
  return toCaptureCounts(runIds, shotCounts, failureCounts);
}
