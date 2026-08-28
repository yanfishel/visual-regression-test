import { describe, expect, it } from "vitest";
import {
  computeNextRunAt,
  isSupportedTimeZone,
  maxRunsPerDay,
  runTimesFor,
  SCHEDULE_SKIP_REASONS,
  SCHEDULE_WINDOW_HOURS,
  SCHEDULE_WINDOWS,
} from "./schedule.js";

const JERUSALEM = "Asia/Jerusalem";
const NEW_YORK = "America/New_York";
const LORD_HOWE = "Australia/Lord_Howe";
const KATHMANDU = "Asia/Kathmandu";

// Reads an instant back as wall-clock text in a zone, so the assertions say
// what a person would see rather than a UTC offset arithmetic result.
function wallClock(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(instant)
    .replace(",", "");
}

describe("isSupportedTimeZone", () => {
  it("accepts IANA zones and rejects junk", () => {
    expect(isSupportedTimeZone(JERUSALEM)).toBe(true);
    expect(isSupportedTimeZone("UTC")).toBe(true);
    expect(isSupportedTimeZone("Mars/Olympus")).toBe(false);
    expect(isSupportedTimeZone("")).toBe(false);
  });
});

describe("schedule vocabulary re-exports", () => {
  it("is importable from ./schedule.js, the one subpath client code uses", () => {
    expect(SCHEDULE_WINDOWS).toEqual(["night", "day", "any"]);
    expect(SCHEDULE_WINDOW_HOURS).toEqual({
      night: { start: 20, length: 12 },
      day: { start: 8, length: 12 },
      any: { start: 0, length: 24 },
    });
    expect(SCHEDULE_SKIP_REASONS).toEqual(["run-in-progress", "no-pages", "quota-exceeded"]);
  });
});

describe("maxRunsPerDay", () => {
  it("is one run an hour, so the window's hours are the ceiling", () => {
    expect(maxRunsPerDay("night")).toBe(12);
    expect(maxRunsPerDay("day")).toBe(12);
    expect(maxRunsPerDay("any")).toBe(24);
  });
});

describe("runTimesFor", () => {
  const at = (times: { hour: number; minute: number }[]): string[] =>
    times.map((t) => `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`);

  it("centres a single run in its window", () => {
    expect(at(runTimesFor("night", 1))).toEqual(["02:00"]);
    expect(at(runTimesFor("day", 1))).toEqual(["14:00"]);
    expect(at(runTimesFor("any", 1))).toEqual(["12:00"]);
  });

  it("spreads several runs evenly, centred in their intervals", () => {
    expect(at(runTimesFor("night", 2))).toEqual(["05:00", "23:00"]);
    expect(at(runTimesFor("night", 3))).toEqual(["02:00", "06:00", "22:00"]);
    expect(at(runTimesFor("day", 3))).toEqual(["10:00", "14:00", "18:00"]);
    expect(at(runTimesFor("any", 3))).toEqual(["04:00", "12:00", "20:00"]);
  });

  it("returns times of day sorted ascending, whatever the window's start", () => {
    // `night` starts at 20:00 and wraps past midnight, so its slots are not
    // in the order they were generated.
    expect(at(runTimesFor("night", 4))).toEqual(["00:30", "03:30", "06:30", "21:30"]);
  });

  it("fills the window at its ceiling, one run an hour", () => {
    const night = at(runTimesFor("night", 12));
    expect(night).toHaveLength(12);
    expect(night[0]).toBe("00:30");
    expect(new Set(night).size).toBe(12);
    expect(at(runTimesFor("any", 24))).toHaveLength(24);
  });

  it("rounds to the minute without colliding", () => {
    const times = at(runTimesFor("night", 7));
    expect(new Set(times).size).toBe(7);
  });

  it("rejects a count outside the window's range", () => {
    expect(() => runTimesFor("night", 0)).toThrow();
    expect(() => runTimesFor("night", 13)).toThrow();
    expect(() => runTimesFor("any", 25)).toThrow();
  });
});

describe("computeNextRunAt with derived times", () => {
  const nightly = { runsPerDay: 3, window: "night" as const, timeZone: "Asia/Jerusalem" };

  it("picks the next slot of the day", () => {
    // slots are 02:00, 06:00, 22:00 local
    const from = new Date("2026-08-17T03:00:00+03:00");
    expect(computeNextRunAt(nightly, from).toISOString()).toBe("2026-08-17T03:00:00.000Z"); // 06:00 local
  });

  it("wraps to the first slot of the next day", () => {
    const from = new Date("2026-08-17T23:00:00+03:00");
    expect(computeNextRunAt(nightly, from).toISOString()).toBe("2026-08-17T23:00:00.000Z"); // 02:00 next day
  });

  it("is strictly after `from` when they coincide with a slot", () => {
    const from = new Date("2026-08-17T02:00:00+03:00");
    const next = computeNextRunAt(nightly, from);
    expect(next.getTime()).toBeGreaterThan(from.getTime());
  });
});

// A single-slot `day` schedule (one run, centred at 14:00 local) exercises the
// calendar-rollover boundary cases the old daily-frequency tests covered -
// today vs. tomorrow, month/year edges, coincidence - independent of window
// shape, which the block above already covers.
describe("computeNextRunAt - daily boundary cases", () => {
  const daily = { runsPerDay: 1, window: "day" as const, timeZone: JERUSALEM };

  it("returns today's slot when it is still ahead", () => {
    const from = new Date("2026-08-17T00:00:00+03:00");
    expect(wallClock(computeNextRunAt(daily, from), JERUSALEM)).toBe("2026-08-17 14:00");
  });

  it("rolls to tomorrow once the slot has passed", () => {
    const from = new Date("2026-08-17T20:00:00+03:00");
    expect(wallClock(computeNextRunAt(daily, from), JERUSALEM)).toBe("2026-08-18 14:00");
  });

  it("is strictly after `from` even when they coincide exactly", () => {
    const from = new Date("2026-08-17T14:00:00+03:00");
    expect(wallClock(computeNextRunAt(daily, from), JERUSALEM)).toBe("2026-08-18 14:00");
  });

  it("crosses a month boundary", () => {
    const from = new Date("2026-08-31T20:00:00+03:00");
    expect(wallClock(computeNextRunAt(daily, from), JERUSALEM)).toBe("2026-09-01 14:00");
  });

  it("crosses a year boundary", () => {
    const from = new Date("2026-12-31T20:00:00+02:00");
    expect(wallClock(computeNextRunAt(daily, from), JERUSALEM)).toBe("2027-01-01 14:00");
  });

  it("keeps the same wall-clock slot across a day shortened by spring-forward", () => {
    // New York springs forward 2026-03-08 at 02:00 -> 03:00 local; the slot
    // itself (14:00) is unaffected, but the day it lands on is only 23h long.
    const daily = { runsPerDay: 1, window: "day" as const, timeZone: NEW_YORK };
    const from = new Date("2026-03-07T15:00:00-05:00");
    const first = computeNextRunAt(daily, from);
    expect(wallClock(first, NEW_YORK)).toBe("2026-03-08 14:00");
    expect(wallClock(computeNextRunAt(daily, first), NEW_YORK)).toBe("2026-03-09 14:00");
  });
});

// `any` at its ceiling (24) puts a slot on every hour at :30, which is a
// convenient probe for exercising a specific DST gap/ambiguity: pick the
// slot that lands inside the transition and start `from` just after the
// slot before it.
describe("computeNextRunAt - DST edges", () => {
  const hourly = { runsPerDay: 24, window: "any" as const, timeZone: NEW_YORK };

  it("resolves a wall-clock time that does not exist to the next one that does", () => {
    // 02:30 never happens in New York on 2026-03-08 - that slot.
    const from = new Date("2026-03-08T01:35:00-05:00"); // just after the 01:30 slot
    const next = computeNextRunAt(hourly, from);
    expect(next.toISOString()).toBe("2026-03-08T07:00:00.000Z"); // 03:00 local, the instant the gap ends
  });

  it("resolves an ambiguous wall-clock time to the first occurrence", () => {
    // 01:30 happens twice in New York on 2026-11-01; the first is UTC 05:30.
    const from = new Date("2026-11-01T00:35:00-04:00"); // just after the 00:30 slot
    expect(computeNextRunAt(hourly, from).toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });
});

// New York is UTC-, the one sign of offset where sampling the pre/post
// transition offset at the wrong instant still happens to cancel out. These
// pin the same two rules in a UTC+ zone (Jerusalem) and in a zone whose DST
// delta is 30 minutes rather than 60 (Lord Howe) - two shapes the New York
// cases above cannot distinguish a correct implementation from a broken one.
describe("computeNextRunAt - DST edges in a UTC+ zone", () => {
  const hourly = { runsPerDay: 24, window: "any" as const, timeZone: JERUSALEM };

  it("resolves an ambiguous wall-clock time to the first occurrence (Asia/Jerusalem)", () => {
    // 01:30 happens twice in Jerusalem on 2026-10-25; the first is UTC 22:30 the day before.
    const from = new Date("2026-10-25T00:35:00+03:00");
    expect(computeNextRunAt(hourly, from).toISOString()).toBe("2026-10-24T22:30:00.000Z");
  });

  it("resolves a wall-clock time that does not exist to the next one that does (Asia/Jerusalem)", () => {
    // 02:30 never happens in Jerusalem on 2026-03-27.
    const from = new Date("2026-03-27T01:35:00+02:00");
    expect(computeNextRunAt(hourly, from).toISOString()).toBe("2026-03-27T00:00:00.000Z"); // 03:00 local
  });
});

describe("computeNextRunAt - DST edges with a 30-minute delta", () => {
  it("resolves an ambiguous wall-clock time to the first occurrence (Australia/Lord_Howe)", () => {
    // 01:30 happens twice on Lord Howe Island on 2026-04-05; the first is UTC 14:30 the day before.
    const hourly = { runsPerDay: 24, window: "any" as const, timeZone: LORD_HOWE };
    const from = new Date("2026-04-05T00:35:00+11:00");
    expect(computeNextRunAt(hourly, from).toISOString()).toBe("2026-04-04T14:30:00.000Z");
  });
});

describe("computeNextRunAt - fractional-offset zones", () => {
  it("honours a zone whose offset is not a whole hour", () => {
    const nepal = { runsPerDay: 1, window: "day" as const, timeZone: KATHMANDU };
    const from = new Date("2026-08-17T05:00:00+05:45");
    const next = computeNextRunAt(nepal, from);
    expect(wallClock(next, KATHMANDU)).toBe("2026-08-17 14:00");
    expect(next.toISOString()).toBe("2026-08-17T08:15:00.000Z");
  });
});
