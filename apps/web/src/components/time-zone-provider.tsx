"use client";

import { createContext, useContext, type ReactNode } from "react";

// The zone the *server* rendered run timestamps in - the `vrt-tz` cookie's
// value, or null when the request carried none. `LocalTime` uses it as its
// server snapshot so that, once the cookie exists, the server markup and the
// client's own formatting agree and hydration has nothing to swap.
const TimeZoneContext = createContext<string | null>(null);

export function TimeZoneProvider({ timeZone, children }: { timeZone: string | null; children: ReactNode }) {
  return <TimeZoneContext.Provider value={timeZone}>{children}</TimeZoneContext.Provider>;
}

export function useServerTimeZone(): string | null {
  return useContext(TimeZoneContext);
}
