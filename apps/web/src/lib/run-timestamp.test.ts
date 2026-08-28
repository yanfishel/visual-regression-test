import { describe, expect, it } from "vitest";
import { formatLocalRunTime, formatRunTimestamp } from "./run-timestamp.js";

const AT = new Date("2026-08-15T19:42:46.202Z");

describe("formatRunTimestamp", () => {
  it("is the UTC fallback, second-precise", () => {
    expect(formatRunTimestamp(AT)).toBe("2026-08-15 19:42:46 UTC");
  });
});

describe("formatLocalRunTime", () => {
  it("renders in the given zone, 24-hour clock, minute precision", () => {
    expect(formatLocalRunTime(AT, "Asia/Jerusalem")).toBe("Aug 15, 2026, 22:42");
    expect(formatLocalRunTime(AT, "UTC")).toBe("Aug 15, 2026, 19:42");
    // Past midnight in the zone - the date follows the zone too.
    expect(formatLocalRunTime(AT, "Asia/Tokyo")).toBe("Aug 16, 2026, 04:42");
  });
});
