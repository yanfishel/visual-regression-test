import { count, eq, inArray } from "drizzle-orm";
import { comparisons, db, shots, type Database } from "@vrt/db";
import type { ComparisonStatus } from "@vrt/shared/constants";

// Comparison outcome of one run - the same three buckets the /projects cards
// summarize (`ProjectCardResult`): approved counts as passed, since approving
// is how a failed diff is accepted, and `new` is what still awaits a look.
export interface ComparisonCounts {
  passed: number;
  failed: number;
  unreviewed: number;
}

export interface RunStatusCountRow {
  runId: string;
  status: ComparisonStatus;
  count: number;
}

// Every requested run gets an entry, so list renderers can index without a
// zero-default at each call site (same contract as toCaptureCounts).
export function toComparisonCounts(
  runIds: string[],
  rows: RunStatusCountRow[],
): Map<string, ComparisonCounts> {
  const counts = new Map<string, ComparisonCounts>(
    runIds.map((runId) => [runId, { passed: 0, failed: 0, unreviewed: 0 }]),
  );
  for (const row of rows) {
    const entry = counts.get(row.runId);
    if (!entry) {
      continue;
    }
    if (row.status === "passed" || row.status === "approved") {
      entry.passed += row.count;
    } else if (row.status === "failed") {
      entry.failed += row.count;
    } else {
      entry.unreviewed += row.count;
    }
  }
  return counts;
}

/**
 * One grouped query for a whole run list, never one per row - comparisons
 * hang off shots, so the run id comes through the join.
 */
export async function getComparisonCounts(
  runIds: string[],
  database: Database = db,
): Promise<Map<string, ComparisonCounts>> {
  if (runIds.length === 0) {
    return new Map();
  }
  const rows = await database
    .select({ runId: shots.runId, status: comparisons.status, count: count() })
    .from(comparisons)
    .innerJoin(shots, eq(comparisons.shotId, shots.id))
    .where(inArray(shots.runId, runIds))
    .groupBy(shots.runId, comparisons.status);
  return toComparisonCounts(runIds, rows);
}
