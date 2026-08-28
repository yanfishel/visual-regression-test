import { describe, expect, it } from "vitest";
import type { Comparison, Database, PageRow, Run, Shot, Viewport } from "@vrt/db";
import { getComparisonViewData } from "./data.js";

function createFakeDb(fixtures: {
  run: Run;
  shots: Shot[];
  pages: PageRow[];
  viewports: Viewport[];
  comparisons: Comparison[];
  baselineShot?: Shot;
  baselineRun?: Run;
}): Database {
  // The first runs lookup is the viewed run (getRunResultData), the second
  // the run the baseline shot came from.
  let runLookups = 0;
  return {
    query: {
      runs: {
        findFirst: async () => (runLookups++ === 0 ? fixtures.run : (fixtures.baselineRun ?? undefined)),
      },
      shots: {
        findMany: async () => fixtures.shots,
        findFirst: async () => fixtures.baselineShot,
      },
      captureFailures: { findMany: async () => [] },
      pages: { findMany: async () => fixtures.pages },
      viewports: { findMany: async () => fixtures.viewports },
      comparisons: { findMany: async () => fixtures.comparisons },
    },
  } as unknown as Database;
}

const run = { id: "run-1", projectId: "project-1", status: "done" } as Run;
const pages: PageRow[] = [
  { id: "page-a", label: "Home" } as PageRow,
  { id: "page-b", label: "Pricing" } as PageRow,
];
const viewports: Viewport[] = [
  { id: "viewport-x", label: "Desktop", width: 1200 } as Viewport,
  { id: "viewport-y", label: "Mobile", width: 375 } as Viewport,
];
// Grid order (page label, then viewport widest-first - see the run page's
// `compareGridOrder`): shot-a, shot-b, shot-c.
const shots: Shot[] = [
  {
    id: "shot-a",
    runId: "run-1",
    pageId: "page-a",
    viewportId: "viewport-x",
    storageKey: "key-a",
    width: 1200,
    height: 3000,
  } as Shot,
  {
    id: "shot-b",
    runId: "run-1",
    pageId: "page-a",
    viewportId: "viewport-y",
    storageKey: "key-b",
    width: 375,
    height: 5000,
  } as Shot,
  {
    id: "shot-c",
    runId: "run-1",
    pageId: "page-b",
    viewportId: "viewport-x",
    storageKey: "key-c",
    width: 1200,
    height: 2000,
  } as Shot,
];

describe("getComparisonViewData", () => {
  it("returns the comparison, its baseline run, and every sibling in grid order with the position", async () => {
    const comparisons: Comparison[] = [
      { id: "cmp-a", shotId: "shot-a", baselineShotId: "baseline-a", status: "passed" } as Comparison,
      {
        id: "cmp-b",
        shotId: "shot-b",
        baselineShotId: "baseline-b",
        status: "failed",
        regionReport: { entries: [] },
      } as unknown as Comparison,
      { id: "cmp-c", shotId: "shot-c", baselineShotId: "baseline-c", status: "new" } as Comparison,
    ];
    const baselineShot = {
      id: "baseline-b",
      runId: "run-0",
      storageKey: "baseline-key-b",
      width: 375,
      height: 4800,
    } as Shot;
    const baselineRun = { id: "run-0", projectId: "project-1", status: "done" } as Run;

    const fakeDb = createFakeDb({ run, shots, pages, viewports, comparisons, baselineShot, baselineRun });

    const result = await getComparisonViewData("cmp-b", "run-1", "project-1", fakeDb);

    expect(result).toEqual({
      run,
      comparison: comparisons[1],
      page: pages[0],
      viewport: viewports[1],
      currentShot: { id: "shot-b", storageKey: "key-b", width: 375, height: 5000 },
      baselineShot: { id: "baseline-b", storageKey: "baseline-key-b", width: 375, height: 4800 },
      baselineRun,
      siblings: [
        { id: "cmp-a", pageLabel: "Home", viewportLabel: "Desktop", status: "passed" },
        { id: "cmp-b", pageLabel: "Home", viewportLabel: "Mobile", status: "failed" },
        { id: "cmp-c", pageLabel: "Pricing", viewportLabel: "Desktop", status: "new" },
      ],
      index: 1,
      regionReport: { entries: [] },
    });
  });

  it("skips shots without a comparison from the sibling list", async () => {
    // shot-b has no comparison row (e.g. still being processed) - it must
    // not appear as a stop, and the positions must count comparisons only.
    const comparisons: Comparison[] = [
      { id: "cmp-a", shotId: "shot-a", baselineShotId: null, status: "new" } as Comparison,
      { id: "cmp-c", shotId: "shot-c", baselineShotId: null, status: "new" } as Comparison,
    ];
    const fakeDb = createFakeDb({ run, shots, pages, viewports, comparisons });

    const result = await getComparisonViewData("cmp-c", "run-1", "project-1", fakeDb);

    expect(result?.siblings.map((entry) => entry.id)).toEqual(["cmp-a", "cmp-c"]);
    expect(result?.index).toBe(1);
  });

  it("returns null when the run belongs to a different project", async () => {
    const comparisons: Comparison[] = [
      { id: "cmp-a", shotId: "shot-a", baselineShotId: null, status: "new" } as Comparison,
    ];
    const fakeDb = createFakeDb({ run, shots, pages, viewports, comparisons });

    const result = await getComparisonViewData("cmp-a", "run-1", "some-other-project", fakeDb);

    expect(result).toBeNull();
  });

  it("returns baselineShot/baselineRun: null when the comparison has no baseline yet", async () => {
    const comparisons: Comparison[] = [
      { id: "cmp-a", shotId: "shot-a", baselineShotId: null, status: "new" } as Comparison,
    ];
    const fakeDb = createFakeDb({ run, shots, pages, viewports, comparisons });

    const result = await getComparisonViewData("cmp-a", "run-1", "project-1", fakeDb);

    expect(result?.baselineShot).toBeNull();
    expect(result?.baselineRun).toBeNull();
    expect(result?.siblings).toHaveLength(1);
    expect(result?.index).toBe(0);
  });

  it("returns null when the comparisonId isn't part of this run", async () => {
    const comparisons: Comparison[] = [
      { id: "cmp-a", shotId: "shot-a", baselineShotId: null, status: "new" } as Comparison,
    ];
    const fakeDb = createFakeDb({ run, shots, pages, viewports, comparisons });

    const result = await getComparisonViewData("cmp-does-not-exist", "run-1", "project-1", fakeDb);

    expect(result).toBeNull();
  });

  it("reads a malformed region_report as null instead of failing the page", async () => {
    const comparisons: Comparison[] = [
      {
        id: "cmp-a",
        shotId: "shot-a",
        baselineShotId: null,
        status: "new",
        regionReport: { entries: "nope" },
      } as unknown as Comparison,
    ];
    const fakeDb = createFakeDb({ run, shots, pages, viewports, comparisons });

    const result = await getComparisonViewData("cmp-a", "run-1", "project-1", fakeDb);

    expect(result?.regionReport).toBeNull();
  });
});
