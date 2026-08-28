import { describe, expect, it } from "vitest";
import { describeCaptureCounts, toCaptureCounts } from "./run-capture-counts";

describe("toCaptureCounts", () => {
  it("joins shot and failure counts onto every requested run, zero-filled", () => {
    const counts = toCaptureCounts(
      ["run-a", "run-b", "run-c"],
      [
        { runId: "run-a", count: 3 },
        { runId: "run-b", count: 6 },
      ],
      [{ runId: "run-a", count: 3 }],
    );

    expect(counts.get("run-a")).toEqual({ captured: 3, failed: 3 });
    expect(counts.get("run-b")).toEqual({ captured: 6, failed: 0 });
    expect(counts.get("run-c")).toEqual({ captured: 0, failed: 0 });
  });
});

describe("describeCaptureCounts", () => {
  it("spells out how many of the run's captures failed", () => {
    expect(describeCaptureCounts({ captured: 3, failed: 3 })).toBe("3/6 captures failed");
    expect(describeCaptureCounts({ captured: 0, failed: 1 })).toBe("1/1 captures failed");
  });

  it("says nothing for a run with no capture failures - a worker crash is not a capture problem", () => {
    expect(describeCaptureCounts({ captured: 6, failed: 0 })).toBeNull();
    expect(describeCaptureCounts(undefined)).toBeNull();
  });
});
