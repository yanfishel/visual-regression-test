import { eq } from "drizzle-orm";
import {
  db,
  runs,
  shots,
  type Comparison,
  type Database,
  type PageRow,
  type Run,
  type Viewport,
} from "@vrt/db";
import type { RegionReport } from "@vrt/shared/regions";
import type { ComparisonSibling } from "@/lib/comparison-walk";
import { getRunResultData } from "../../data.js";
// Relative (not `@/lib`) so vitest, which has no path alias, can load this module.
import { parseRegionReport } from "../../../../../../../../lib/region-report.js";

export interface ComparisonShotInfo {
  id: string;
  storageKey: string;
  /** Pixel size of the stored image - the viewer's overlays are sized from these, not from naturalWidth. */
  width: number;
  height: number;
}

export interface ComparisonViewData {
  run: Run;
  comparison: Comparison;
  page: PageRow;
  viewport: Viewport;
  currentShot: ComparisonShotInfo;
  baselineShot: ComparisonShotInfo | null;
  /** The run the baseline shot was captured in - what the viewer's baseline caption dates. */
  baselineRun: Run | null;
  /** Every comparison of the run in grid order (`compareGridOrder`), the viewed one included. */
  siblings: ComparisonSibling[];
  /** Position of the viewed comparison in `siblings`. */
  index: number;
  /** Parsed `comparisons.region_report`; null when there is none or it failed to parse. */
  regionReport: RegionReport | null;
}

export async function getComparisonViewData(
  comparisonId: string,
  runId: string,
  projectId: string,
  database: Database = db,
): Promise<ComparisonViewData | null> {
  const runData = await getRunResultData(runId, projectId, database);
  if (!runData) {
    return null;
  }

  const rows = runData.rows;
  const rowIndex = rows.findIndex((row) => row.comparison?.id === comparisonId);
  if (rowIndex === -1) {
    return null;
  }

  const row = rows[rowIndex]!;
  const comparison = row.comparison;
  if (!comparison || !row.page || !row.viewport) {
    return null;
  }

  let baselineShot: ComparisonShotInfo | null = null;
  let baselineRun: Run | null = null;
  if (comparison.baselineShotId) {
    const shot = await database.query.shots.findFirst({ where: eq(shots.id, comparison.baselineShotId) });
    if (!shot) {
      throw new Error(`Baseline shot missing: ${comparison.baselineShotId}`);
    }
    baselineShot = { id: shot.id, storageKey: shot.storageKey, width: shot.width, height: shot.height };
    baselineRun = (await database.query.runs.findFirst({ where: eq(runs.id, shot.runId) })) ?? null;
  }

  // Shots without a comparison row are not stops: nothing to view there yet.
  const siblings: ComparisonSibling[] = [];
  let index = -1;
  for (const entry of rows) {
    if (!entry.comparison) {
      continue;
    }
    if (entry.comparison.id === comparisonId) {
      index = siblings.length;
    }
    siblings.push({
      id: entry.comparison.id,
      pageLabel: entry.page?.label ?? "Deleted page",
      viewportLabel: entry.viewport?.label ?? "Deleted viewport",
      status: entry.comparison.status,
    });
  }

  return {
    run: runData.run,
    comparison,
    page: row.page,
    viewport: row.viewport,
    currentShot: { id: row.shotId, storageKey: row.storageKey, width: row.width, height: row.height },
    baselineShot,
    baselineRun,
    siblings,
    index,
    regionReport: parseRegionReport(comparison.regionReport),
  };
}
