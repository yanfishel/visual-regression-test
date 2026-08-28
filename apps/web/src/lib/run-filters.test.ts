import { describe, expect, it } from "vitest";
import type { Run } from "@vrt/db";
import { filterRuns, parseRunFilter } from "./run-filters.js";

function run(id: string, status: Run["status"]): Pick<Run, "id" | "status"> {
  return { id, status };
}

const runs = [
  run("done-clean", "done"),
  run("done-with-diffs", "done"),
  run("worker-failed", "failed"),
  run("running", "running"),
  run("queued", "queued"),
];
const counts = new Map([["done-with-diffs", { passed: 1, failed: 2, unreviewed: 0 }]]);

describe("filterRuns", () => {
  it("returns everything, in order, without a filter", () => {
    expect(filterRuns(runs, counts, null).map((r) => r.id)).toEqual([
      "done-clean",
      "done-with-diffs",
      "worker-failed",
      "running",
      "queued",
    ]);
  });

  it("'failed' keeps worker failures and runs with failed comparisons", () => {
    expect(filterRuns(runs, counts, "failed").map((r) => r.id)).toEqual(["done-with-diffs", "worker-failed"]);
  });

  it("'passed' keeps only finished runs with nothing failed - pending runs match neither", () => {
    expect(filterRuns(runs, counts, "passed").map((r) => r.id)).toEqual(["done-clean"]);
  });
});

describe("parseRunFilter", () => {
  it("accepts the known values and nothing else", () => {
    expect(parseRunFilter("failed")).toBe("failed");
    expect(parseRunFilter("passed")).toBe("passed");
    expect(parseRunFilter("all")).toBeNull();
    expect(parseRunFilter("running")).toBeNull();
    expect(parseRunFilter(undefined)).toBeNull();
    expect(parseRunFilter(["failed"])).toBeNull();
  });
});
