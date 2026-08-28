import { describe, expect, it } from "vitest";
import type { RegionEntry, RegionReport, RegionStatus } from "@vrt/shared/regions";
import { formatRegionSummary, parseRegionReport } from "./region-report.js";

const rect = { x: 0, y: 0, width: 10, height: 10 };
const entry = (status: RegionStatus): RegionEntry => ({
  key: "div",
  label: "div",
  status,
  baseline: rect,
  current: rect,
  diffScore: null,
});
const report = (...statuses: RegionStatus[]): RegionReport => ({ entries: statuses.map(entry) });

describe("formatRegionSummary", () => {
  it("lists the non-unchanged counts in a fixed order, skipping zeros", () => {
    expect(
      formatRegionSummary(report("added", "changed", "removed", "changed", "unchanged", "moved", "resized")),
    ).toBe("2 changed · 1 resized · 1 moved · 1 added · 1 removed");
  });

  it("is null with no report, an empty report, or nothing but unchanged regions", () => {
    expect(formatRegionSummary(null)).toBeNull();
    expect(formatRegionSummary(report())).toBeNull();
    expect(formatRegionSummary(report("unchanged", "unchanged"))).toBeNull();
  });

  it("renders a single non-zero status alone", () => {
    expect(formatRegionSummary(report("moved", "moved"))).toBe("2 moved");
  });
});

describe("parseRegionReport (re-exported)", () => {
  it("turns a malformed jsonb value into null", () => {
    expect(parseRegionReport({ entries: "nope" })).toBeNull();
  });
});
