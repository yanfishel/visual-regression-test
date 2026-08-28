// The viewer's IANA time zone travels in a cookie so the server can render
// run timestamps in it straight away (components/local-time.tsx). Written
// by a pre-hydration script in the root layout on every page load, so it is
// there for the next request; the very first request of a fresh browser has
// none and falls back to UTC + a client swap.
//
// Plain module (no "use client", no next/headers) - the layout reads the
// cookie, this only names it and validates its value.
export const TIME_ZONE_COOKIE = "vrt-tz";

/** A year: the zone rarely changes, and the script refreshes it anyway. */
export const TIME_ZONE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

// A cookie is user input; only a zone Intl actually knows gets through,
// which also keeps anything odd out of the formatter.
export function parseTimeZone(value: unknown): string | null {
  if (typeof value !== "string" || value === "") {
    return null;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return null;
  }
}
