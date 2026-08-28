import { eq } from "drizzle-orm";
import { automatedRunLimitFor, projectSchedules, type Database, type UserRow } from "@vrt/db";
import {
  computeNextRunAt,
  isSupportedTimeZone,
  maxRunsPerDay,
  type ScheduleInput,
  type ScheduleWindow,
} from "@vrt/shared";
import { planCeilingText, windowCeilingText } from "./schedule-display.js";

/**
 * Two ceilings, checked in the order a person would ask about them: the
 * window physically holds only so many runs, and the plan allows only so
 * many. Re-checked here because the dialog only greys out what it knows, and
 * a greyed-out control is a hint, never a rule.
 */
export function assertAffordableCount(
  runsPerDay: number,
  window: ScheduleWindow,
  limit: number | null,
): void {
  const ceiling = maxRunsPerDay(window);
  if (runsPerDay > ceiling) {
    throw new Error(windowCeilingText(window));
  }
  if (limit !== null && runsPerDay > limit) {
    throw new Error(planCeilingText(limit));
  }
}

/** The row to insert or update, with `next_run_at` computed server-side. */
export function scheduleRowFrom(projectId: string, input: ScheduleInput, now: Date) {
  if (!isSupportedTimeZone(input.timeZone)) {
    throw new Error(`Unknown time zone: ${input.timeZone}`);
  }
  return {
    projectId,
    runsPerDay: input.runsPerDay,
    window: input.window,
    timeZone: input.timeZone,
    paused: false,
    nextRunAt: computeNextRunAt(
      { runsPerDay: input.runsPerDay, window: input.window, timeZone: input.timeZone },
      now,
    ),
  };
}

/**
 * Upsert-or-delete, inside the caller's transaction: the dialog submits the
 * whole project at once, so `null` here means "the user chose Off" and the
 * row goes away rather than lingering as invisible state.
 *
 * Pausing is deliberately NOT this path - it keeps the row and only flips
 * `paused`, so the setting survives (see toggleScheduleAction).
 */
export async function writeProjectSchedule(
  tx: Database,
  projectId: string,
  input: ScheduleInput | null,
  owner: UserRow,
  now: Date = new Date(),
): Promise<void> {
  if (!input) {
    await tx.delete(projectSchedules).where(eq(projectSchedules.projectId, projectId));
    return;
  }
  // automatedRunLimitFor is the one place an automated-run limit is resolved
  // (also used by the scheduler's quota guard and toggleScheduleAction's
  // resume check) - a limit worked out three different ways is exactly the
  // split-brain this codebase had to fix once already. `owner` MUST be the
  // project's owner, resolved via resolveProjectOwner (authz.ts) - never the
  // caller's own session user, who may be an admin editing someone else's
  // project.
  const limit = await automatedRunLimitFor(tx, owner);
  assertAffordableCount(input.runsPerDay, input.window, limit);

  const row = scheduleRowFrom(projectId, input, now);
  await tx
    .insert(projectSchedules)
    .values(row)
    .onConflictDoUpdate({
      target: projectSchedules.projectId,
      // `paused` is deliberately absent here: the dialog owns the cadence,
      // not the pause state (toggleScheduleAction owns that) - the project
      // dialog submits the whole project on every save, and if this set
      // included `paused: false` a save as small as a name change would
      // silently resume a schedule the user paused on purpose. The INSERT
      // side above still sets `paused: false` (via scheduleRowFrom) because a
      // schedule being created for the first time is meant to run.
      set: {
        runsPerDay: row.runsPerDay,
        window: row.window,
        timeZone: row.timeZone,
        nextRunAt: row.nextRunAt,
      },
    });
}
