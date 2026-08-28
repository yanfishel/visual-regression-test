import { describe, expect, it } from "vitest";
import { formatRunDuration, runDurationSeconds } from "./run-duration.js";

const START = new Date("2026-08-15T19:42:00Z");

describe("runDurationSeconds", () => {
  it("is the wall time between start and finish, rounded to whole seconds", () => {
    expect(runDurationSeconds({ startedAt: START, finishedAt: new Date("2026-08-15T19:42:41.600Z") })).toBe(
      42,
    );
  });

  it("is null while the run has not started or has not finished", () => {
    expect(runDurationSeconds({ startedAt: null, finishedAt: null })).toBeNull();
    expect(runDurationSeconds({ startedAt: START, finishedAt: null })).toBeNull();
    // A run that failed before the worker picked it up (enqueue error) has a
    // finish time but no start - nothing meaningful to measure.
    expect(runDurationSeconds({ startedAt: null, finishedAt: START })).toBeNull();
  });

  it("never goes negative on clock skew between the two writes", () => {
    expect(runDurationSeconds({ startedAt: START, finishedAt: new Date("2026-08-15T19:41:59Z") })).toBe(0);
  });
});

describe("formatRunDuration", () => {
  it("shows plain seconds under a minute", () => {
    expect(formatRunDuration(0)).toBe("0s");
    expect(formatRunDuration(42)).toBe("42s");
    expect(formatRunDuration(59)).toBe("59s");
  });

  it("splits out minutes from a minute up", () => {
    expect(formatRunDuration(60)).toBe("1m 0s");
    expect(formatRunDuration(312)).toBe("5m 12s");
  });

  it("splits out hours from an hour up", () => {
    expect(formatRunDuration(3600)).toBe("1h 0m 0s");
    expect(formatRunDuration(3725)).toBe("1h 2m 5s");
  });
});
