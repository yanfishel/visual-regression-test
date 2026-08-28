import {
  maxRunsPerDay,
  runTimesFor,
  type ScheduleSkipReason,
  type ScheduleSpec,
  type ScheduleWindow,
} from "@vrt/shared/schedule";

// Imported by client components, so this module must stay free of @vrt/db
// and of the @vrt/shared root barrel (CLAUDE.md §9 trap index).

// The dialog's "no schedule" default, also used as the fallback
// ProjectDialogData.schedule wherever the server hasn't recorded one yet.
// Kept in this plain module rather than schedule-fields.tsx (a "use client"
// file) so the server components that build ProjectDialogData
// (project-card.tsx, the project page) can import it without crossing a
// client boundary - a Server Component reading a named export off a "use
// client" module gets a client-reference stub, not the real value.
export const OFF_SCHEDULE = { enabled: false, runsPerDay: 1, window: "night" as const };

/**
 * Maps a stored schedule row - or its absence - to the dialog's draft shape.
 * Shared by every place that builds ProjectDialogData.schedule
 * (project-card.tsx, the project page) so the "no row means OFF_SCHEDULE"
 * rule lives in exactly one place instead of being copy-pasted at each call
 * site.
 */
export function toScheduleDraft(schedule: { runsPerDay: number; window: ScheduleWindow } | null): {
  enabled: boolean;
  runsPerDay: number;
  window: ScheduleWindow;
} {
  if (!schedule) {
    return OFF_SCHEDULE;
  }
  return { enabled: true, runsPerDay: schedule.runsPerDay, window: schedule.window };
}

// The window named as a noun, for windowCeilingText ("Night fits at most...").
// The dialog's window SelectMenu used to capitalize these too; it now
// completes a sentence with SCHEDULE_PHRASE below instead.
export const WINDOW_LABEL: Record<ScheduleWindow, string> = { night: "night", day: "day", any: "any time" };

// The window folded into "<count> <phrase>" for describeSchedule - a
// separate map from WINDOW_LABEL because the two readings diverge: `any`
// says "a day" rather than "a any time" (the window spans the whole day, so
// naming the day is what a person would actually say), and `day` says
// "during the day" to stay distinct from `any`; only `night`'s "a night"
// happens to read the same as its WINDOW_LABEL entry. Exported for the
// dialog's window SelectMenu (schedule-fields.tsx), whose options complete
// the sentence "Run 6 times ..." with these very phrases - so the dialog
// and the project page say the schedule the same way.
export const SCHEDULE_PHRASE: Record<ScheduleWindow, string> = {
  night: "a night",
  day: "during the day",
  any: "a day",
};

/** "3 times a night", "Once a day" - the count and window the way a person would say them. */
export function describeSchedule(spec: ScheduleSpec): string {
  const count = spec.runsPerDay === 1 ? "Once" : spec.runsPerDay === 2 ? "Twice" : `${spec.runsPerDay} times`;
  return `${count} ${SCHEDULE_PHRASE[spec.window]}`;
}

function formatClockTime(time: { hour: number; minute: number }): string {
  return `${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`;
}

// "a" | "a and b" | "a, b and c" - no Oxford comma, matching the rest of
// this module's prose. Indexing the last element explicitly (rather than
// relying on a length check to narrow it) is what noUncheckedIndexedAccess
// requires. Exported so other prose-building modules (e.g.
// project-dialog-requirements.ts) share this one joining rule instead of
// each growing their own.
export function joinWithAnd(items: readonly string[]): string {
  if (items.length <= 1) {
    return items[0] ?? "";
  }
  const last = items[items.length - 1] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${last}`;
}

/**
 * "02:00, 06:00 and 22:00" - the actual clock times a schedule fires,
 * derived from runTimesFor rather than restated, so this can never drift
 * from what computeNextRunAt will really do.
 */
export function describeRunTimes(spec: ScheduleSpec): string {
  return joinWithAnd(runTimesFor(spec.window, spec.runsPerDay).map(formatClockTime));
}

/**
 * The run-count choices worth offering in the dialog's dropdown: 1 up to
 * whichever is smaller, the window's physical ceiling (maxRunsPerDay) or
 * the project's plan allowance. `limit === null` means an unlimited plan
 * (admins), so only the window bounds the list; a zero-run plan correctly
 * yields no choices at all rather than a dropdown with one useless option.
 */
export function allowedRunCounts(window: ScheduleWindow, limit: number | null): number[] {
  const ceiling = maxRunsPerDay(window);
  const cap = Math.max(limit === null ? ceiling : Math.min(ceiling, limit), 0);
  return Array.from({ length: cap }, (_, index) => index + 1);
}

/**
 * Counts forward, mirroring lib/time-ago.ts's counting backward. Deliberately
 * coarse: "in 14 h" is what a person checking a schedule wants, and a
 * to-the-second countdown would only make the server-rendered value look
 * stale.
 */
export function formatTimeUntil(target: Date, now: Date = new Date()): string {
  const seconds = Math.floor((target.getTime() - now.getTime()) / 1000);
  if (seconds <= 0) {
    return "due now";
  }
  if (seconds < 60) {
    return "in under a minute";
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `in ${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `in ${hours} h`;
  }
  return `in ${Math.floor(hours / 24)} d`;
}

export interface SchedulePillContent {
  state: "on" | "paused" | "off";
  /** The one word shown on the pill itself - has to stand alone, since the
   *  tooltip carrying `detail` never opens on tap. */
  label: string;
  /** The Radix tooltip's extra line - an addition, never the only carrier. */
  detail: string;
}

/**
 * The /projects card's schedule pill content, always returned - even with no
 * schedule row at all, so the feature stays discoverable rather than only
 * visible once someone has already found the dialog. The word
 * is "On", not "Running": `running` is already `runs.status`, rendered by
 * RunOutcomePill on the same card, and giving one word two meanings where
 * both are visible at once is exactly the collision this codebase avoids
 * (CLAUDE.md §9).
 *
 * `now` must be the server's request-time Date, never a client-side
 * `new Date()` - the page is force-dynamic, so request time is the
 * reference point (lib/time-ago.ts documents the same convention). Passing
 * finished strings down (rather than the schedule + `now`) keeps every date
 * computation on the server, since project-card.tsx is itself a Server
 * Component wrapping a "use client" tooltip.
 */
export function describeSchedulePill(
  schedule: (ScheduleSpec & { paused: boolean; nextRunAt: Date }) | null,
  now: Date,
): SchedulePillContent {
  if (!schedule) {
    return { state: "off", label: "Off", detail: "No schedule — set one in Edit" };
  }
  if (schedule.paused) {
    return { state: "paused", label: "Paused", detail: `Paused · ${describeSchedule(schedule)}` };
  }
  return {
    state: "on",
    label: "On",
    detail: `${describeSchedule(schedule)} · next ${formatTimeUntil(schedule.nextRunAt, now)}`,
  };
}

// Why an occurrence produced no run, and what the reader can do about it.
// The wording lives here rather than in the component because it is the
// answer to a question the FAQ also asks (CLAUDE.md §9).
export const SKIP_REASON_TEXT: Record<ScheduleSkipReason, { label: string; advice: string }> = {
  "run-in-progress": {
    label: "a run of this project was still going",
    advice: "The previous run had not finished. It will try again at the next slot.",
  },
  "no-pages": {
    label: "this project has no pages to capture",
    advice: "Add at least one page and one viewport in Edit, and the schedule starts working again.",
  },
  "quota-exceeded": {
    label: "the daily automated run limit was reached",
    advice: "Automated runs for this project hit its plan's daily allowance. Pressing Run is free.",
  },
};

/**
 * Why the run count is capped, in the reader's own terms: the window
 * physically holds only so many runs (never more than one an hour, see
 * maxRunsPerDay), independent of any plan. Derived from maxRunsPerDay
 * rather than a literal so the sentence can never drift from the actual
 * ceiling.
 */
export function windowCeilingText(window: ScheduleWindow): string {
  const label = WINDOW_LABEL[window];
  const capitalized = label.charAt(0).toUpperCase() + label.slice(1);
  return `${capitalized} fits at most ${maxRunsPerDay(window)} runs a day, one an hour.`;
}

/** Why the run count is capped, in the reader's own terms: the project's plan. */
export function planCeilingText(limit: number): string {
  return `Your plan allows ${limit} automated run${limit === 1 ? "" : "s"} a day for this project.`;
}

/**
 * The zero-allowance panel (schedule-fields.tsx) has to say what saving will
 * do to a schedule the project already had - the panel replaces the Off/On
 * control entirely, so there is no way left on screen to turn the schedule
 * off by hand once the plan drops to zero. Saying so here, rather than
 * leaving it implicit, is what keeps the dialog (and therefore the whole
 * project - it is the only write path for pages and viewports too) saveable
 * instead of permanently blocked by a schedule nothing on screen can remove.
 */
export function zeroLimitScheduleText(): string {
  return "Your plan does not include automated runs. Pressing Run is always free. Saving will remove this project's existing schedule, if it has one.";
}

/**
 * A schedule can outlive the plan it was saved under: an admin lowers the
 * role's daily allowance in /settings, and the count that was saved (fitting
 * at the time) no longer fits the dropdown when the project is reopened. The
 * window's own ceiling never changes, so a plan reduction is the only way
 * this happens. Silently clamping the dropdown to what still fits would
 * leave the reader wondering where their original count went - naming it is
 * what turns the mystery into an explanation (schedule-fields.tsx shows this
 * once, alongside the clamp, not as a replacement for it).
 */
export function runCountReducedText(previousCount: number): string {
  return `Reduced from ${previousCount}: your plan now allows fewer automated runs for this project.`;
}

const SKIP_VISIBLE_MS = 48 * 60 * 60 * 1000;

/**
 * A skip is worth showing while it is still the latest thing that happened
 * and recent enough to act on. A banner that never clears is a banner nobody
 * reads.
 */
export function shouldShowSkip(
  schedule: { lastSkippedAt: Date | null; lastRunAt: Date | null },
  now: Date = new Date(),
): boolean {
  if (!schedule.lastSkippedAt) {
    return false;
  }
  if (schedule.lastRunAt && schedule.lastRunAt >= schedule.lastSkippedAt) {
    return false;
  }
  return now.getTime() - schedule.lastSkippedAt.getTime() < SKIP_VISIBLE_MS;
}
