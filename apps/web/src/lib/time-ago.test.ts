import { describe, expect, it } from "vitest";
import { formatTimeAgo } from "./time-ago.js";

const NOW = new Date("2026-08-14T12:00:00Z");

describe("formatTimeAgo", () => {
  it("labels anything under a minute as 'just now'", () => {
    expect(formatTimeAgo(new Date("2026-08-14T11:59:59Z"), NOW)).toBe("just now");
    expect(formatTimeAgo(NOW, NOW)).toBe("just now");
  });

  it("uses minutes under an hour", () => {
    expect(formatTimeAgo(new Date("2026-08-14T11:59:00Z"), NOW)).toBe("1m ago");
    expect(formatTimeAgo(new Date("2026-08-14T11:01:00Z"), NOW)).toBe("59m ago");
  });

  it("uses hours under a day", () => {
    expect(formatTimeAgo(new Date("2026-08-14T11:00:00Z"), NOW)).toBe("1h ago");
    expect(formatTimeAgo(new Date("2026-08-13T12:30:00Z"), NOW)).toBe("23h ago");
  });

  it("uses days under 30 days", () => {
    expect(formatTimeAgo(new Date("2026-08-13T11:00:00Z"), NOW)).toBe("1d ago");
    expect(formatTimeAgo(new Date("2026-07-16T12:00:00Z"), NOW)).toBe("29d ago");
  });

  it("falls back to the calendar date beyond 30 days", () => {
    expect(formatTimeAgo(new Date("2026-07-01T09:00:00Z"), NOW)).toBe("2026-07-01");
  });

  it("treats a slightly future date as 'just now' instead of a negative count", () => {
    expect(formatTimeAgo(new Date("2026-08-14T12:00:05Z"), NOW)).toBe("just now");
  });
});
