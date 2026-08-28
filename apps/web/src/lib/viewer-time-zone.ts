import { cookies } from "next/headers";
import { parseTimeZone, TIME_ZONE_COOKIE } from "./time-zone.js";

// The viewer's zone from the `vrt-tz` cookie (lib/time-zone.ts), or null
// on a request that carries none yet. Server-only (next/headers) - kept
// apart from lib/time-zone.ts, which client code imports too.
export async function getViewerTimeZone(): Promise<string | null> {
  return parseTimeZone((await cookies()).get(TIME_ZONE_COOKIE)?.value);
}
