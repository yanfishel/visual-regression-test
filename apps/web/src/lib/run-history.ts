import { and, eq, gte, inArray } from "drizzle-orm";
import { comparisons, db, runs, shots, type Database, type Run } from "@vrt/db";
import { runOutcome } from "./run-outcome.js";

export interface RunHistoryDay {
  /** Local midnight of the bucket's calendar day. */
  date: Date;
  /**
   * The day's labels, rendered here in the server's zone - the one the
   * buckets follow - never by the client component from `date`. Formatting
   * the instant in the browser would use the viewer's zone and, near
   * midnight, name a different calendar day than the server did: a
   * hydration mismatch that React 19 recovers from by re-rendering the root,
   * which also drops the theme class the init script put on <html>.
   */
  /** `YYYY-MM-DD`, a stable React key. */
  key: string;
  /** One letter under the column: "M". */
  weekdayInitial: string;
  /** Axis ends and the sr-only table: "Aug 22". */
  label: string;
  /** Column tooltip: "Fri, Aug 22". */
  tooltipLabel: string;
  passed: number;
  failed: number;
  /** Queued or running: counted so a half-finished day reads as such, never an outcome. */
  pending: number;
}

export interface RunHistory {
  /** One bucket per calendar day, oldest first, ending today. */
  days: RunHistoryDay[];
  totalPassed: number;
  totalFailed: number;
  totalPending: number;
  /** Whole-percent share of the window's *finished* runs that passed; null when none finished. */
  passRatePercent: number | null;
  /** The same figure over the window immediately before this one, for the trend. */
  previousPassRatePercent: number | null;
  /**
   * The trend: percentage points gained or lost against that window, null when
   * either side has nothing finished to rate. Derived here rather than in the
   * component because `runs-timeline.tsx` is a client component and may only
   * import this module's *types* - a runtime import drags `@vrt/db` and with it
   * `postgres` into the browser bundle (CLAUDE.md section 9's trap index).
   */
  passRateDeltaPoints: number | null;
}

export const RUN_HISTORY_DAYS = 7;

const WEEKDAY_INITIAL_FORMAT = new Intl.DateTimeFormat("en-US", { weekday: "narrow" });
const DAY_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const TOOLTIP_DAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

// Local calendar fields, not toISOString: the bucket is a local midnight and
// the ISO form would shift it to the previous UTC day east of Greenwich.
function localDateKey(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Buckets follow the server's local calendar days - a run at 23:00 belongs to
// that evening's day, not to a 24-hour offset from "now". Passed vs failed is
// lib/run-outcome.ts's rule; queued and running runs are pending, and a
// pending run is in no window's pass rate.
//
// `runRows` is expected to span *twice* the visible window: the older half
// never reaches a bucket and exists only to rate the preceding period, which
// is what the headline delta compares against.
export function bucketRunHistory(
  runRows: Pick<Run, "id" | "status" | "createdAt">[],
  runIdsWithFailedComparisons: Set<string>,
  options: { days: number; now: Date },
): RunHistory {
  const start = startOfLocalDay(options.now);
  start.setDate(start.getDate() - (options.days - 1));

  const days: RunHistoryDay[] = Array.from({ length: options.days }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      date,
      key: localDateKey(date),
      weekdayInitial: WEEKDAY_INITIAL_FORMAT.format(date),
      label: DAY_FORMAT.format(date),
      tooltipLabel: TOOLTIP_DAY_FORMAT.format(date),
      passed: 0,
      failed: 0,
      pending: 0,
    };
  });

  let previousPassed = 0;
  let previousFinished = 0;

  for (const run of runRows) {
    const outcome = runOutcome(run.status, runIdsWithFailedComparisons.has(run.id));
    // Rounding absorbs the odd-hour offset a DST switch inside the window
    // introduces between two local midnights.
    const index = Math.round((startOfLocalDay(run.createdAt).getTime() - start.getTime()) / DAY_MS);

    if (index < 0) {
      if (index < -options.days || outcome === "queued" || outcome === "running") {
        continue;
      }
      previousFinished++;
      if (outcome === "passed") {
        previousPassed++;
      }
      continue;
    }

    const day = days[index];
    if (!day) {
      continue;
    }
    if (outcome === "queued" || outcome === "running") {
      day.pending++;
    } else if (outcome === "failed") {
      day.failed++;
    } else {
      day.passed++;
    }
  }

  const totalPassed = days.reduce((sum, day) => sum + day.passed, 0);
  const totalFailed = days.reduce((sum, day) => sum + day.failed, 0);
  const passRatePercent = percentOf(totalPassed, totalPassed + totalFailed);
  const previousPassRatePercent = percentOf(previousPassed, previousFinished);

  return {
    days,
    totalPassed,
    totalFailed,
    totalPending: days.reduce((sum, day) => sum + day.pending, 0),
    passRatePercent,
    previousPassRatePercent,
    // Both rates are rounded before subtracting so the trend always agrees
    // with the figure on screen: 62% against 71% reads as 9 points, never 8.6.
    passRateDeltaPoints:
      passRatePercent === null || previousPassRatePercent === null
        ? null
        : passRatePercent - previousPassRatePercent,
  };
}

function percentOf(part: number, total: number): number | null {
  return total === 0 ? null : Math.round((part / total) * 100);
}

export async function getRunHistory(
  projectIds: string[],
  options?: { days?: number; now?: Date },
  database: Database = db,
): Promise<RunHistory> {
  const days = options?.days ?? RUN_HISTORY_DAYS;
  const now = options?.now ?? new Date();
  if (projectIds.length === 0) {
    return bucketRunHistory([], new Set(), { days, now });
  }

  // Twice the visible window: the older half is never plotted and only rates
  // the preceding period for the headline delta (bucketRunHistory splits it).
  const fetchStart = startOfLocalDay(now);
  fetchStart.setDate(fetchStart.getDate() - (2 * days - 1));

  const [runRows, failedRows] = await Promise.all([
    database.query.runs.findMany({
      where: and(inArray(runs.projectId, projectIds), gte(runs.createdAt, fetchStart)),
      columns: { id: true, status: true, createdAt: true },
    }),
    // One grouped join over the whole project list, cut down to the window -
    // never a per-run comparison lookup.
    database
      .selectDistinct({ runId: shots.runId })
      .from(comparisons)
      .innerJoin(shots, eq(comparisons.shotId, shots.id))
      .innerJoin(runs, eq(shots.runId, runs.id))
      .where(
        and(
          inArray(runs.projectId, projectIds),
          gte(runs.createdAt, fetchStart),
          eq(comparisons.status, "failed"),
        ),
      ),
  ]);

  return bucketRunHistory(runRows, new Set(failedRows.map((row) => row.runId)), { days, now });
}

function startOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}
