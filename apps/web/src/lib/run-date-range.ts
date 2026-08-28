// The run table's date filter: `?from=YYYY-MM-DD&to=YYYY-MM-DD`, judged on
// each run's *calendar day in the viewer's zone* (the `vrt-tz` cookie, see
// lib/time-zone.ts) - a run at 22:30Z on the 15th is an Aug 16 run to
// someone in Jerusalem, and that is the day they picked in the calendar.
// Comparing YYYY-MM-DD keys lexicographically sidesteps every zone-offset
// arithmetic; the formatter does the zone work.

export interface DateRange {
  /** Inclusive lower bound, YYYY-MM-DD, or null for open. */
  from: string | null;
  /** Inclusive upper bound, YYYY-MM-DD, or null for open. */
  to: string | null;
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function parseDateKey(value: unknown): string | null {
  if (typeof value !== "string" || !DATE_KEY.test(value)) {
    return null;
  }
  // "2026-13-45" matches the shape but not the calendar; Date rolls it over
  // rather than rejecting, so round-trip it.
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? null : value;
}

export function parseDateRange(fromValue: unknown, toValue: unknown): DateRange | null {
  let from = parseDateKey(fromValue);
  let to = parseDateKey(toValue);
  if (!from && !to) {
    return null;
  }
  if (from && to && from > to) {
    [from, to] = [to, from];
  }
  return { from, to };
}

const keyFormatters = new Map<string, Intl.DateTimeFormat>();

/** The calendar day of `date` in `timeZone`, as YYYY-MM-DD. */
export function localDateKey(date: Date, timeZone: string): string {
  let formatter = keyFormatters.get(timeZone);
  if (!formatter) {
    // en-CA is the locale whose short date is already YYYY-MM-DD.
    formatter = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone,
    });
    keyFormatters.set(timeZone, formatter);
  }
  return formatter.format(date);
}

export function filterRunsByDate<T extends { createdAt: Date }>(
  runs: T[],
  range: DateRange | null,
  timeZone: string,
): T[] {
  if (!range) {
    return runs;
  }
  return runs.filter((run) => {
    const key = localDateKey(run.createdAt, timeZone);
    return (!range.from || key >= range.from) && (!range.to || key <= range.to);
  });
}
