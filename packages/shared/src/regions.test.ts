import { describe, expect, it } from "vitest";
import {
  parseRegionReport,
  parseRegions,
  regionReportSchema,
  regionSchema,
  summarizeRegionReport,
  type RegionReport,
} from "./regions.js";

const region = {
  key: "section#pricing",
  label: 'section#pricing › "Pricing"',
  x: 0,
  y: 120,
  width: 1200,
  height: 640,
};

describe("regionSchema", () => {
  it("accepts a region in screenshot pixels", () => {
    expect(regionSchema.parse(region)).toEqual(region);
  });

  it("rejects a rect with no area or a negative origin - clipRegions must have run first", () => {
    expect(regionSchema.safeParse({ ...region, width: 0 }).success).toBe(false);
    expect(regionSchema.safeParse({ ...region, y: -1 }).success).toBe(false);
    expect(regionSchema.safeParse({ ...region, x: 1.5 }).success).toBe(false);
  });
});

describe("parseRegions / parseRegionReport", () => {
  it("returns null for anything that is not the expected shape, never throws", () => {
    expect(parseRegions(null)).toBeNull();
    expect(parseRegions("garbage")).toBeNull();
    expect(parseRegions([{ key: "div" }])).toBeNull();
    expect(parseRegionReport({ entries: [{ status: "nope" }] })).toBeNull();
    expect(parseRegionReport(undefined)).toBeNull();
  });

  it("passes a valid value through", () => {
    expect(parseRegions([region])).toEqual([region]);
    const rect = { x: region.x, y: region.y, width: region.width, height: region.height };
    const report: RegionReport = {
      entries: [
        { key: "header", label: "header", status: "unchanged", baseline: rect, current: rect, diffScore: 0 },
      ],
    };
    expect(parseRegionReport(report)).toEqual(report);
    expect(regionReportSchema.parse({ entries: [] })).toEqual({ entries: [] });
  });
});

describe("summarizeRegionReport", () => {
  it("counts every status, zero for the absent ones", () => {
    const rect = { x: region.x, y: region.y, width: region.width, height: region.height };
    const entry = (status: RegionReport["entries"][number]["status"]) => ({
      key: "div",
      label: "div",
      status,
      baseline: rect,
      current: rect,
      diffScore: null,
    });
    const counts = summarizeRegionReport({
      entries: [entry("changed"), entry("changed"), entry("added"), entry("unchanged")],
    });
    expect(counts).toEqual({ unchanged: 1, moved: 0, changed: 2, resized: 0, added: 1, removed: 0 });
  });
});
