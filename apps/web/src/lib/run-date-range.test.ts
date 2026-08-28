import { describe, expect, it } from "vitest";
import { filterRunsByDate, localDateKey, parseDateRange } from "./run-date-range.js";

describe("parseDateRange", () => {
  it("accepts YYYY-MM-DD bounds, either side optional", () => {
    expect(parseDateRange("2026-08-01", "2026-08-15")).toEqual({ from: "2026-08-01", to: "2026-08-15" });
    expect(parseDateRange("2026-08-01", undefined)).toEqual({ from: "2026-08-01", to: null });
    expect(parseDateRange(undefined, "2026-08-15")).toEqual({ from: null, to: "2026-08-15" });
  });

  it("is null with no bounds, and drops a malformed or impossible one", () => {
    expect(parseDateRange(undefined, undefined)).toBeNull();
    expect(parseDateRange("15.08.2026", "garbage")).toBeNull();
    expect(parseDateRange("2026-13-45", undefined)).toBeNull();
    expect(parseDateRange(["2026-08-01"], undefined)).toBeNull();
  });

  it("swaps bounds given backwards", () => {
    expect(parseDateRange("2026-08-15", "2026-08-01")).toEqual({ from: "2026-08-01", to: "2026-08-15" });
  });
});

describe("localDateKey", () => {
  it("is the calendar day in the given zone", () => {
    const at = new Date("2026-08-15T22:30:00Z");
    expect(localDateKey(at, "UTC")).toBe("2026-08-15");
    expect(localDateKey(at, "Asia/Jerusalem")).toBe("2026-08-16");
    expect(localDateKey(at, "America/Los_Angeles")).toBe("2026-08-15");
  });
});

describe("filterRunsByDate", () => {
  const runs = [
    { id: "late-15th-utc", createdAt: new Date("2026-08-15T22:30:00Z") },
    { id: "noon-10th", createdAt: new Date("2026-08-10T12:00:00Z") },
    { id: "first-of-month", createdAt: new Date("2026-08-01T00:10:00Z") },
  ];

  it("keeps runs whose local calendar day falls inside the bounds, inclusive", () => {
    expect(
      filterRunsByDate(runs, { from: "2026-08-01", to: "2026-08-10" }, "UTC").map((run) => run.id),
    ).toEqual(["noon-10th", "first-of-month"]);
  });

  it("judges the day in the viewer's zone - 22:30Z on the 15th is already the 16th in Jerusalem", () => {
    expect(
      filterRunsByDate(runs, { from: "2026-08-16", to: "2026-08-16" }, "Asia/Jerusalem").map((run) => run.id),
    ).toEqual(["late-15th-utc"]);
    expect(filterRunsByDate(runs, { from: "2026-08-16", to: "2026-08-16" }, "UTC")).toEqual([]);
  });

  it("treats a missing bound as open", () => {
    expect(filterRunsByDate(runs, { from: "2026-08-10", to: null }, "UTC").map((run) => run.id)).toEqual([
      "late-15th-utc",
      "noon-10th",
    ]);
    expect(filterRunsByDate(runs, null, "UTC")).toBe(runs);
  });
});
