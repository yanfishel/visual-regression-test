import { describe, expect, it } from "vitest";
import {
  allowedRunCounts,
  describeRunTimes,
  describeSchedule,
  describeSchedulePill,
  formatTimeUntil,
  OFF_SCHEDULE,
  planCeilingText,
  runCountReducedText,
  shouldShowSkip,
  SKIP_REASON_TEXT,
  toScheduleDraft,
  windowCeilingText,
  zeroLimitScheduleText,
} from "./schedule-display.js";

describe("describeSchedule", () => {
  it("says the count and the window the way a person would", () => {
    expect(describeSchedule({ runsPerDay: 3, window: "night", timeZone: "UTC" })).toBe("3 times a night");
    expect(describeSchedule({ runsPerDay: 1, window: "night", timeZone: "UTC" })).toBe("Once a night");
    expect(describeSchedule({ runsPerDay: 1, window: "any", timeZone: "UTC" })).toBe("Once a day");
    expect(describeSchedule({ runsPerDay: 2, window: "day", timeZone: "UTC" })).toBe("Twice during the day");
  });
});

describe("describeRunTimes", () => {
  it("lists the derived times in plain English", () => {
    expect(describeRunTimes({ runsPerDay: 3, window: "night", timeZone: "UTC" })).toBe(
      "02:00, 06:00 and 22:00",
    );
    expect(describeRunTimes({ runsPerDay: 1, window: "day", timeZone: "UTC" })).toBe("14:00");
  });
});

describe("allowedRunCounts", () => {
  it("stops at the smaller of the window and the plan", () => {
    expect(allowedRunCounts("night", 2)).toEqual([1, 2]);
    expect(allowedRunCounts("night", 100)).toHaveLength(12);
    expect(allowedRunCounts("any", 100)).toHaveLength(24);
    expect(allowedRunCounts("night", null)).toHaveLength(12);
    expect(allowedRunCounts("night", 0)).toEqual([]);
  });
});

describe("formatTimeUntil", () => {
  const now = new Date("2026-08-17T09:00:00Z");
  it("counts forward in the coarsest useful unit", () => {
    expect(formatTimeUntil(new Date("2026-08-17T09:00:30Z"), now)).toBe("in under a minute");
    expect(formatTimeUntil(new Date("2026-08-17T09:45:00Z"), now)).toBe("in 45 min");
    expect(formatTimeUntil(new Date("2026-08-17T23:00:00Z"), now)).toBe("in 14 h");
    expect(formatTimeUntil(new Date("2026-08-20T09:00:00Z"), now)).toBe("in 3 d");
  });

  it("says a past slot is due rather than showing a negative", () => {
    expect(formatTimeUntil(new Date("2026-08-17T08:00:00Z"), now)).toBe("due now");
  });
});

describe("describeSchedulePill", () => {
  const now = new Date("2026-08-17T09:00:00Z");
  const base = { runsPerDay: 3, window: "night" as const, timeZone: "UTC" };

  it("says Off with no row, never inferable from the icon alone", () => {
    expect(describeSchedulePill(null, now)).toEqual({
      state: "off",
      label: "Off",
      detail: "No schedule — set one in Edit",
    });
  });

  it("says Paused, with the cadence still in the detail", () => {
    expect(describeSchedulePill({ ...base, paused: true, nextRunAt: now }, now)).toEqual({
      state: "paused",
      label: "Paused",
      detail: "Paused · 3 times a night",
    });
  });

  it("says On, never Running - runs.status already owns that word", () => {
    const pill = describeSchedulePill(
      { ...base, paused: false, nextRunAt: new Date("2026-08-17T23:00:00Z") },
      now,
    );
    expect(pill).toEqual({
      state: "on",
      label: "On",
      detail: "3 times a night · next in 14 h",
    });
  });
});

describe("ceiling copy", () => {
  it("explains each bound in its own terms", () => {
    expect(windowCeilingText("night")).toBe("Night fits at most 12 runs a day, one an hour.");
    expect(planCeilingText(2)).toBe("Your plan allows 2 automated runs a day for this project.");
  });

  it("pluralizes a plan limit of exactly one run", () => {
    expect(planCeilingText(1)).toBe("Your plan allows 1 automated run a day for this project.");
  });

  it("names the previous count when a stored schedule outlived its plan", () => {
    expect(runCountReducedText(20)).toBe(
      "Reduced from 20: your plan now allows fewer automated runs for this project.",
    );
  });

  it("tells the reader a zero-allowance save removes an existing schedule", () => {
    expect(zeroLimitScheduleText()).toBe(
      "Your plan does not include automated runs. Pressing Run is always free. Saving will remove this project's existing schedule, if it has one.",
    );
  });
});

describe("shouldShowSkip", () => {
  const now = new Date("2026-08-17T09:00:00Z");
  it("shows a fresh skip", () => {
    expect(shouldShowSkip({ lastSkippedAt: new Date("2026-08-17T03:00:00Z"), lastRunAt: null }, now)).toBe(
      true,
    );
  });

  it("hides a skip a later run has superseded", () => {
    expect(
      shouldShowSkip(
        { lastSkippedAt: new Date("2026-08-17T03:00:00Z"), lastRunAt: new Date("2026-08-17T04:00:00Z") },
        now,
      ),
    ).toBe(false);
  });

  it("hides a skip older than two days so the banner clears itself", () => {
    expect(shouldShowSkip({ lastSkippedAt: new Date("2026-08-14T03:00:00Z"), lastRunAt: null }, now)).toBe(
      false,
    );
  });

  it("hides nothing when there was never a skip", () => {
    expect(shouldShowSkip({ lastSkippedAt: null, lastRunAt: null }, now)).toBe(false);
  });
});

describe("toScheduleDraft", () => {
  it("returns OFF_SCHEDULE when there is no row", () => {
    expect(toScheduleDraft(null)).toEqual(OFF_SCHEDULE);
  });

  it("carries the row's fields through, marked enabled", () => {
    expect(toScheduleDraft({ runsPerDay: 5, window: "day" })).toEqual({
      enabled: true,
      runsPerDay: 5,
      window: "day",
    });
  });
});

describe("SKIP_REASON_TEXT", () => {
  it("gives every reason a label and something to do about it", () => {
    for (const reason of ["run-in-progress", "no-pages", "quota-exceeded"] as const) {
      expect(SKIP_REASON_TEXT[reason].label.length).toBeGreaterThan(0);
      expect(SKIP_REASON_TEXT[reason].advice.length).toBeGreaterThan(0);
    }
  });
});
