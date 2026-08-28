"use client";

import { useSyncExternalStore } from "react";
import { formatLocalRunTime, formatRunTimestamp } from "@/lib/run-timestamp";
import { useServerTimeZone } from "./time-zone-provider";

const noopSubscribe = () => () => {};

/**
 * A run timestamp in the viewer's own time zone.
 *
 * The server formats in the zone the `vrt-tz` cookie names
 * (`TimeZoneProvider`), the client in the browser's - normally the same
 * zone, so the two labels are identical and nothing visibly changes on
 * hydration. Only a request with no cookie yet (a fresh browser's first
 * load) renders the UTC fallback and lets the client swap it. That swap
 * goes through `useSyncExternalStore` with distinct server and client
 * snapshots - the sanctioned way to differ from the server without a
 * hydration mismatch or an effect + state round trip.
 */
export function LocalTime({ date, className }: { date: Date; className?: string }) {
  const serverZone = useServerTimeZone();
  const label = useSyncExternalStore(
    noopSubscribe,
    () => formatLocalRunTime(date, Intl.DateTimeFormat().resolvedOptions().timeZone),
    () => (serverZone ? formatLocalRunTime(date, serverZone) : formatRunTimestamp(date)),
  );
  return (
    <time dateTime={date.toISOString()} className={className}>
      {label}
    </time>
  );
}
