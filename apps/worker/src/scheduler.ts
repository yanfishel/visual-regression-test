import { and, eq, lte } from "drizzle-orm";
import {
  ActiveRunError,
  QuotaError,
  assertNoActiveRun,
  assertProjectAutomatedRunQuota,
  db,
  pages,
  projectSchedules,
  projects,
  runs,
  viewports,
  type Database,
  type ProjectSchedule,
} from "@vrt/db";
import { computeNextRunAt, type ScheduleSkipReason } from "@vrt/shared";
import { notifyRunFinished } from "./notify.js";
import { getRunQueue } from "./run-queue.js";

const TICK_INTERVAL_MS = 60_000;
// Bounds a pathological backlog (a worker down for a week, or a burst of
// schedules that all fall on the same minute); the rest wait for the next
// tick 60 seconds later.
const MAX_DUE_PER_TICK = 50;
// Where a poisoned row (an invalid IANA zone, an out-of-range runsPerDay -
// both come from the row's own stored config, not from anything transient)
// gets re-checked, since computeNextRunAt - the normal way to pick the next
// instant - is exactly what may have just thrown. An hour is long enough
// that a broken row doesn't spam the error log every tick, short enough
// that fixing the underlying data (or a transient DB blip healing itself)
// is noticed the same day without operator action.
export const FALLBACK_RETRY_MS = 60 * 60 * 1000;

export interface ScheduleDecision {
  projectId: string;
  runId: string | null;
  skipReason: ScheduleSkipReason | null;
  nextRunAt: Date;
  /**
   * The caught QuotaError's own message ("Daily automated run limit reached:
   * 5 of 5 used…") for a `quota-exceeded` skip - `undefined` otherwise. There
   * is no web surface for this today (a skip's UI wording lives in
   * SKIP_REASON_TEXT, keyed by the coarse reason only), so runScheduleTick's
   * log line is this figure's only home; without carrying it here an operator
   * deciding whether a limit is too tight would have nothing to look at.
   */
  skipDetail?: string;
}

// Injected so the decision logic is testable without a database; production
// always passes the real guards from @vrt/db. Return type is widened to
// `void | Promise<void>` (rather than reusing `typeof assertNoActiveRun`
// verbatim) so a synchronous throwing test fake satisfies the same interface
// as the real, async guard - both are awaited below either way.
export interface ScheduleGuards {
  assertNoActiveRun: (...args: Parameters<typeof assertNoActiveRun>) => void | Promise<void>;
  assertProjectAutomatedRunQuota: (
    ...args: Parameters<typeof assertProjectAutomatedRunQuota>
  ) => void | Promise<void>;
}

const REAL_GUARDS: ScheduleGuards = { assertNoActiveRun, assertProjectAutomatedRunQuota };

/**
 * Decide what one due schedule does, and do it. Guards run cheapest first:
 * the quota check takes a per-user advisory lock, so it is not worth taking
 * for a project that is busy or unrunnable anyway.
 */
export async function decideSchedule(
  tx: Database,
  schedule: ProjectSchedule,
  now: Date,
  guards: ScheduleGuards = REAL_GUARDS,
): Promise<{ runId: string | null; skipReason: ScheduleSkipReason | null; skipDetail?: string }> {
  const project = await tx.query.projects.findFirst({
    where: eq(projects.id, schedule.projectId),
    with: { owner: true },
  });
  // The FK cascade removes the schedule with its project, so this only
  // happens in the race where the project was deleted mid-tick. Reported as
  // the unrunnable-project skip rather than a new reason nobody will ever see.
  if (!project?.owner) {
    return { runId: null, skipReason: "no-pages" };
  }

  try {
    await guards.assertNoActiveRun(tx, schedule.projectId);
  } catch (error) {
    if (error instanceof ActiveRunError) {
      return { runId: null, skipReason: "run-in-progress" };
    }
    throw error;
  }

  const [projectPages, projectViewports] = await Promise.all([
    tx.query.pages.findMany({ where: eq(pages.projectId, schedule.projectId), columns: { id: true } }),
    tx.query.viewports.findMany({
      where: eq(viewports.projectId, schedule.projectId),
      columns: { id: true },
    }),
  ]);
  if (projectPages.length === 0 || projectViewports.length === 0) {
    return { runId: null, skipReason: "no-pages" };
  }

  try {
    await guards.assertProjectAutomatedRunQuota(tx, schedule.projectId, project.owner, now);
  } catch (error) {
    if (error instanceof QuotaError) {
      return { runId: null, skipReason: "quota-exceeded", skipDetail: error.message };
    }
    throw error;
  }

  const [created] = await tx
    .insert(runs)
    .values({ projectId: schedule.projectId, status: "queued", trigger: "schedule" })
    .returning();
  if (!created) {
    throw new Error(`Failed to create scheduled run for project ${schedule.projectId}`);
  }
  return { runId: created.id, skipReason: null };
}

/**
 * Decide and record the outcome of one due schedule, isolated in its own
 * savepoint so it can never take the rest of the batch down with it. Rows
 * are claimed `order by next_run_at`, so an error that escaped this
 * function unhandled would not just lose this row's work - it would abort
 * every earlier row's advance in the same tick too, and because this row's
 * `next_run_at` would then be unchanged, it would be claimed *first* again
 * on every following tick. That turns one bad row into a permanent, mostly
 * silent stall of every schedule behind it.
 *
 * Guard failures (`ActiveRunError`/`QuotaError`) never reach this function's
 * own catch - `decideSchedule` already turns those into skip reasons. What
 * lands here is a genuinely unexpected failure: the row's own stored
 * config (an invalid IANA zone, an out-of-range runsPerDay - see
 * `computeNextRunAt`), a repeating DB error, or this module's own
 * null-runId/null-skipReason invariant check. Such a row can't be advanced
 * the normal way - `computeNextRunAt` may be exactly what threw - so it
 * gets `FALLBACK_RETRY_MS` instead, and the failure is logged loudly with
 * the project id, since that log line is the only record of what happened.
 */
export async function runOneSchedule(
  tx: Database,
  schedule: ProjectSchedule,
  now: Date,
): Promise<ScheduleDecision> {
  try {
    return await tx.transaction(async (savepoint) => {
      const { runId, skipReason, skipDetail } = await decideSchedule(savepoint, schedule, now);
      // Advanced on both outcomes and computed from `now`, never from the
      // slot that was missed: an overdue schedule fires once and moves on.
      const nextRunAt = computeNextRunAt(schedule, now);
      if (runId) {
        await savepoint
          .update(projectSchedules)
          .set({ nextRunAt, lastRunAt: now })
          .where(eq(projectSchedules.projectId, schedule.projectId));
      } else {
        // decideSchedule only returns a null runId together with a real
        // skipReason - the two are never both null - so this branch always
        // has a reason to record.
        if (!skipReason) {
          throw new Error(`Schedule for project ${schedule.projectId} skipped without a reason`);
        }
        await savepoint
          .update(projectSchedules)
          .set({ nextRunAt, lastSkippedAt: now, lastSkipReason: skipReason })
          .where(eq(projectSchedules.projectId, schedule.projectId));
      }
      return { projectId: schedule.projectId, runId, skipReason, nextRunAt, skipDetail };
    });
  } catch (error) {
    console.error(`Schedule tick failed for project ${schedule.projectId}:`, error);
    const nextRunAt = new Date(now.getTime() + FALLBACK_RETRY_MS);
    // last_skip_reason is a real enum column with only the three genuine
    // reasons - none of them fits "the tick itself errored" - so it's
    // cleared rather than left holding a stale reason from a previous,
    // unrelated skip that could be misread as this failure's cause.
    await tx
      .update(projectSchedules)
      .set({ nextRunAt, lastSkippedAt: now, lastSkipReason: null })
      .where(eq(projectSchedules.projectId, schedule.projectId));
    return { projectId: schedule.projectId, runId: null, skipReason: null, nextRunAt };
  }
}

/**
 * One pass over everything that is due.
 *
 * The claim uses `for update skip locked` so a second worker (or a stray dev
 * process against the same database) can never fire the same occurrence
 * twice. Enqueueing happens after the transaction commits: a Redis failure
 * must not be able to leave a job pointing at a rolled-back run.
 *
 * One tick holds a single transaction across up to `MAX_DUE_PER_TICK` rows -
 * the `for update` claim on the whole batch, plus a per-owner advisory lock
 * taken inside `assertProjectAutomatedRunQuota` for each row that reaches it
 * - all released together at commit. Anything added to this loop therefore
 * pays for itself across the whole batch, not per row: a slow per-row step
 * holds every other due project's lock for that much longer.
 */
export async function runScheduleTick(now: Date = new Date()): Promise<ScheduleDecision[]> {
  const decisions = await db.transaction(async (tx) => {
    const due = await tx
      .select()
      .from(projectSchedules)
      .where(and(eq(projectSchedules.paused, false), lte(projectSchedules.nextRunAt, now)))
      .orderBy(projectSchedules.nextRunAt)
      .limit(MAX_DUE_PER_TICK)
      .for("update", { skipLocked: true });

    const results: ScheduleDecision[] = [];
    for (const schedule of due) {
      results.push(await runOneSchedule(tx, schedule, now));
    }
    return results;
  });

  for (const decision of decisions) {
    if (!decision.runId) {
      // skipDetail carries the quota guard's own message (used/limit) - the
      // only place those figures are visible anywhere, since there is no web
      // surface for a single skip's numbers (see ScheduleDecision's comment).
      const detail = decision.skipDetail ? ` — ${decision.skipDetail}` : "";
      console.log(`Schedule ${decision.projectId} skipped: ${decision.skipReason}${detail}`);
      continue;
    }
    try {
      await getRunQueue().add("run", { runId: decision.runId });
    } catch (error) {
      // Same recovery as triggerRunAction: without it the run row sits
      // `queued` forever with no job behind it. The schedule has already
      // advanced, so one bad enqueue costs one occurrence, not the schedule.
      console.error(`Failed to enqueue scheduled run ${decision.runId}:`, error);
      await db
        .update(runs)
        .set({ status: "failed", finishedAt: new Date(), error: "Failed to enqueue run job" })
        .where(eq(runs.id, decision.runId));
      // A scheduled run that never got a job is still a failed scheduled run.
      await notifyRunFinished(decision.runId);
    }
  }

  return decisions;
}

export function startScheduleTicks(): void {
  const tick = (): void => {
    runScheduleTick().catch((error) => {
      console.error("Schedule tick failed:", error);
    });
  };
  tick();
  const timer = setInterval(tick, TICK_INTERVAL_MS);
  timer.unref();
}
