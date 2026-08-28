// How run timestamps read. Two forms:
//
// - `formatLocalRunTime` - what the user sees: the viewer's zone, `en-US`
//   like every other label, `hourCycle: "h23"` for the app's 24-hour clock.
//   The zone comes from the `vrt-tz` cookie on the server (lib/time-zone.ts)
//   and from the browser on the client - same string both sides, so
//   hydration has nothing to swap.
// - `formatRunTimestamp` - the UTC fallback for a request that carries no
//   zone cookie yet (the very first page load); the client replaces it after
//   hydration. Formatted from the ISO string, not toLocaleString - the
//   server's own locale/zone must not leak into the markup.

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone,
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** `Aug 15, 2026, 22:42` in the given IANA zone. */
export function formatLocalRunTime(date: Date, timeZone: string): string {
  return formatterFor(timeZone).format(date);
}

export function formatRunTimestamp(createdAt: Date): string {
  return `${createdAt.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}
