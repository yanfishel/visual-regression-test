import { SCHEDULE_WINDOW_HOURS, type ScheduleWindow } from "./constants.js";

// Client code imports the whole schedule vocabulary from this one subpath
// (the package root barrel drags ioredis into the browser bundle - see
// CLAUDE.md §9), so the enums live here too, not just in constants.ts.
export { SCHEDULE_WINDOWS, SCHEDULE_WINDOW_HOURS, SCHEDULE_SKIP_REASONS } from "./constants.js";
export type { ScheduleWindow, ScheduleSkipReason } from "./constants.js";

export interface ScheduleSpec {
  /** 1..maxRunsPerDay(window). */
  runsPerDay: number;
  window: ScheduleWindow;
  /** IANA zone the derived times are expressed in. */
  timeZone: string;
}

/**
 * Never more than one run an hour. Expressed as the window's hours so it can
 * be stated in a sentence a person can act on - "night gives you at most
 * twelve, one an hour" - rather than as an abstract ceiling.
 */
export function maxRunsPerDay(window: ScheduleWindow): number {
  return SCHEDULE_WINDOW_HOURS[window].length;
}

/**
 * The local times a schedule fires, sorted ascending.
 *
 * Runs are spread evenly across the window and centred in their own
 * intervals - slot i at `start + (i + 0.5) x length / n`. Centring is what
 * keeps a single run away from the window's edge, where it would fire at the
 * exact moment the window opens, and what makes every count symmetrical.
 *
 * The result is a plain list of times of day: `night` wraps past midnight,
 * but the pattern still repeats every 24 hours, so callers never have to know
 * which calendar day a slot "belongs" to.
 */
export function runTimesFor(window: ScheduleWindow, runsPerDay: number): { hour: number; minute: number }[] {
  const ceiling = maxRunsPerDay(window);
  if (!Number.isInteger(runsPerDay) || runsPerDay < 1 || runsPerDay > ceiling) {
    throw new Error(`A ${window} schedule allows 1 to ${ceiling} runs a day, not ${runsPerDay}`);
  }
  const { start, length } = SCHEDULE_WINDOW_HOURS[window];
  const spanMinutes = length * 60;
  const times = Array.from({ length: runsPerDay }, (_, index) => {
    const offset = Math.round(((index + 0.5) * spanMinutes) / runsPerDay);
    const minuteOfDay = (start * 60 + offset) % (24 * 60);
    return { hour: Math.floor(minuteOfDay / 60), minute: minuteOfDay % 60 };
  });
  return times.sort((a, b) => a.hour - b.hour || a.minute - b.minute);
}

export function isSupportedTimeZone(timeZone: string): boolean {
  if (timeZone.length === 0) {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

// A wall-clock date-time with no zone attached - what the user picked in the
// dialog. Arithmetic on these is naive on purpose: "daily at 03:00" means
// 03:00 local on every calendar day, whether that day is 23, 24 or 25 hours
// long.
interface Civil {
  year: number;
  month: number; // 1..12
  day: number;
  hour: number;
  minute: number;
}

const MINUTE_MS = 60_000;

function civilOf(instant: Date, timeZone: string): Civil {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
  };
}

function naiveMs(civil: Civil): number {
  return Date.UTC(civil.year, civil.month - 1, civil.day, civil.hour, civil.minute);
}

function civilFromNaiveMs(ms: number): Civil {
  const date = new Date(ms);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
  };
}

function addNaiveMinutes(civil: Civil, minutes: number): Civil {
  return civilFromNaiveMs(naiveMs(civil) + minutes * MINUTE_MS);
}

// The zone's offset from UTC at a given instant, in milliseconds. Derived by
// formatting the instant in the zone and reading the wall clock back - the
// only way to get IANA offsets without a date library.
function zoneOffsetMs(instant: Date, timeZone: string): number {
  return naiveMs(civilOf(instant, timeZone)) - instant.getTime();
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Turn a wall-clock time in a zone into the instant it names.
 *
 * Two ambiguities have to be decided, and both come from DST:
 * - a time that happens twice (autumn) resolves to the FIRST occurrence;
 * - a time that never happens (spring) resolves to the first instant AFTER
 *   the gap, i.e. the moment the clocks jump to.
 *
 * The two-candidate method: sample the zone's offset a full day before and a
 * full day after the wanted wall clock - far enough that neither sample can
 * itself be inside the transition, so one is reliably the pre-transition
 * offset and the other the post-transition one, regardless of which side of
 * UTC the zone sits on. (A candidate offset sampled at the *wanted* instant
 * itself, interpreted as UTC, does not have this property: for a UTC+ zone
 * that instant already reads past the transition, silently handing back the
 * post-transition offset where a UTC- zone would have handed back the
 * pre-transition one - the ambiguous case then resolved to the *later*
 * occurrence in every positive-offset zone.) If both samples agree there is
 * no transition nearby and nothing to decide. If they differ, at most one or
 * both of the two candidates built from them read back as the wanted wall
 * clock, which is what separates "twice" from "never".
 */
function instantOf(civil: Civil, timeZone: string): Date {
  const wanted = naiveMs(civil);
  const beforeOffset = zoneOffsetMs(new Date(wanted - DAY_MS), timeZone);
  const afterOffset = zoneOffsetMs(new Date(wanted + DAY_MS), timeZone);
  if (beforeOffset === afterOffset) {
    return new Date(wanted - beforeOffset);
  }
  const c1 = wanted - beforeOffset;
  const c2 = wanted - afterOffset;
  const valid = [c1, c2].filter((candidate) => naiveMs(civilOf(new Date(candidate), timeZone)) === wanted);
  if (valid.length > 0) {
    // Ambiguous: earliest occurrence.
    return new Date(Math.min(...valid));
  }
  // Nonexistent: neither candidate reads back, because both still land the
  // wall clock on the wrong side of the gap (one still shifted by the
  // pre-transition offset, one by the post-transition offset) rather than
  // past it. The actual answer - the instant the gap ends - is the
  // transition boundary, found by bisecting for where the local reading
  // jumps from just-before-the-gap to just-after-it. Bisecting on the local
  // reading (rather than comparing `zoneOffsetMs` outputs) matters: `civilOf`
  // only has minute resolution, so an offset computed at a non-minute-aligned
  // instant is off by however far that instant sits past its minute mark,
  // and an equality check against it never lands. The local reading has the
  // same rounding but only needs to cross a threshold, which rounding
  // doesn't disturb.
  let lo = Math.min(c1, c2);
  let hi = Math.max(c1, c2);
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (naiveMs(civilOf(new Date(mid), timeZone)) >= wanted) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return new Date(hi);
}

/**
 * The next instant this schedule fires, strictly after `from`.
 *
 * "Strictly after" is what makes the no-catch-up rule an invariant rather
 * than a special case: a worker that was down for six hours advances a stale
 * schedule to one future slot, not through every missed one.
 */
export function computeNextRunAt(schedule: ScheduleSpec, from: Date): Date {
  const times = runTimesFor(schedule.window, schedule.runsPerDay);
  const local = civilOf(from, schedule.timeZone);
  // Today's slots, then tomorrow's: the first instant strictly after `from`
  // wins. Two days is always enough because the pattern repeats daily, and
  // scanning rather than solving keeps the DST rules in one place.
  for (const dayOffset of [0, 1]) {
    const day = addNaiveMinutes({ ...local, hour: 0, minute: 0 }, dayOffset * 24 * 60);
    for (const time of times) {
      const instant = instantOf({ ...day, hour: time.hour, minute: time.minute }, schedule.timeZone);
      if (instant.getTime() > from.getTime()) {
        return instant;
      }
    }
  }
  throw new Error(`Could not find a next run for a ${schedule.window} schedule in ${schedule.timeZone}`);
}
