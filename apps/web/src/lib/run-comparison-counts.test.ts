import { describe, expect, it } from "vitest";
import { toComparisonCounts } from "./run-comparison-counts.js";

describe("toComparisonCounts", () => {
  it("folds the per-status rows into one entry per run, approved counting as passed", () => {
    const counts = toComparisonCounts(
      ["run-a", "run-b"],
      [
        { runId: "run-a", status: "passed", count: 10 },
        { runId: "run-a", status: "approved", count: 2 },
        { runId: "run-a", status: "failed", count: 3 },
        { runId: "run-b", status: "new", count: 4 },
      ],
    );

    expect(counts.get("run-a")).toEqual({ passed: 12, failed: 3, unreviewed: 0 });
    expect(counts.get("run-b")).toEqual({ passed: 0, failed: 0, unreviewed: 4 });
  });

  it("gives every requested run an all-zero entry when it has no comparisons yet", () => {
    const counts = toComparisonCounts(["queued-run"], []);
    expect(counts.get("queued-run")).toEqual({ passed: 0, failed: 0, unreviewed: 0 });
  });
});
