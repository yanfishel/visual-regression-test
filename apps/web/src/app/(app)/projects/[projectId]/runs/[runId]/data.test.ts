import { describe, expect, it } from "vitest";
import type { CaptureFailureRow, Comparison, Database, PageRow, Run, Shot, Viewport } from "@vrt/db";
import { buildRunGrid, getRunResultData, groupRunGrid, type FailureRow, type ResultRow } from "./data.js";

function createFakeDb(fixtures: {
  run: Run;
  shots: Shot[];
  pages: PageRow[];
  viewports: Viewport[];
  comparisons: Comparison[];
  captureFailures?: CaptureFailureRow[];
}) {
  const calls = { pagesFindMany: 0, viewportsFindMany: 0, comparisonsFindMany: 0 };
  const fakeDb = {
    query: {
      runs: {
        findFirst: async () => fixtures.run,
      },
      shots: {
        findMany: async () => fixtures.shots,
      },
      captureFailures: {
        findMany: async () => fixtures.captureFailures ?? [],
      },
      pages: {
        findMany: async () => {
          calls.pagesFindMany++;
          return fixtures.pages;
        },
      },
      viewports: {
        findMany: async () => {
          calls.viewportsFindMany++;
          return fixtures.viewports;
        },
      },
      comparisons: {
        findMany: async () => {
          calls.comparisonsFindMany++;
          return fixtures.comparisons;
        },
      },
    },
  } as unknown as Database;

  return { fakeDb, calls };
}

describe("getRunResultData", () => {
  it("fetches pages, viewports, and comparisons with one batched query each, regardless of shot count", async () => {
    const run = { id: "run-1", projectId: "project-1", status: "done" } as Run;
    const shots: Shot[] = [
      {
        id: "shot-1",
        runId: "run-1",
        pageId: "page-a",
        viewportId: "viewport-x",
        storageKey: "key-1",
      } as Shot,
      {
        id: "shot-2",
        runId: "run-1",
        pageId: "page-a",
        viewportId: "viewport-y",
        storageKey: "key-2",
      } as Shot,
      {
        id: "shot-3",
        runId: "run-1",
        pageId: "page-b",
        viewportId: "viewport-x",
        storageKey: "key-3",
      } as Shot,
    ];
    const pages: PageRow[] = [
      { id: "page-a", label: "Home" } as PageRow,
      { id: "page-b", label: "Pricing" } as PageRow,
    ];
    const viewports: Viewport[] = [
      { id: "viewport-x", label: "Desktop", width: 1200 } as Viewport,
      { id: "viewport-y", label: "Mobile", width: 375 } as Viewport,
    ];
    const comparisons: Comparison[] = [
      { id: "cmp-1", shotId: "shot-1", status: "passed" } as Comparison,
      { id: "cmp-2", shotId: "shot-2", status: "failed" } as Comparison,
      { id: "cmp-3", shotId: "shot-3", status: "new" } as Comparison,
    ];

    const { fakeDb, calls } = createFakeDb({ run, shots, pages, viewports, comparisons });

    const result = await getRunResultData("run-1", "project-1", fakeDb);

    expect(calls.pagesFindMany).toBe(1);
    expect(calls.viewportsFindMany).toBe(1);
    expect(calls.comparisonsFindMany).toBe(1);

    expect(result?.rows).toEqual([
      {
        shotId: "shot-1",
        storageKey: "key-1",
        page: pages[0],
        viewport: viewports[0],
        comparison: comparisons[0],
      },
      {
        shotId: "shot-2",
        storageKey: "key-2",
        page: pages[0],
        viewport: viewports[1],
        comparison: comparisons[1],
      },
      {
        shotId: "shot-3",
        storageKey: "key-3",
        page: pages[1],
        viewport: viewports[0],
        comparison: comparisons[2],
      },
    ]);
  });

  it("orders rows by page label then viewport (widest first), regardless of shot insertion order", async () => {
    const run = { id: "run-1", projectId: "project-1", status: "done" } as Run;
    const shots: Shot[] = [
      {
        id: "shot-1",
        runId: "run-1",
        pageId: "page-b",
        viewportId: "viewport-y",
        storageKey: "key-1",
      } as Shot,
      {
        id: "shot-2",
        runId: "run-1",
        pageId: "page-a",
        viewportId: "viewport-y",
        storageKey: "key-2",
      } as Shot,
      {
        id: "shot-3",
        runId: "run-1",
        pageId: "page-b",
        viewportId: "viewport-x",
        storageKey: "key-3",
      } as Shot,
      {
        id: "shot-4",
        runId: "run-1",
        pageId: "page-a",
        viewportId: "viewport-x",
        storageKey: "key-4",
      } as Shot,
    ];
    const pages: PageRow[] = [
      { id: "page-a", label: "Home" } as PageRow,
      { id: "page-b", label: "Pricing" } as PageRow,
    ];
    // Viewport labels deliberately sort the other way round from their
    // widths ("Big phone" < "Small desktop"), so widest-first is what the
    // assertion proves - not an alphabetical accident.
    const viewports: Viewport[] = [
      { id: "viewport-y", label: "Big phone", width: 375 } as Viewport,
      { id: "viewport-x", label: "Small desktop", width: 1200 } as Viewport,
    ];
    const comparisons: Comparison[] = [];

    const { fakeDb } = createFakeDb({ run, shots, pages, viewports, comparisons });

    const result = await getRunResultData("run-1", "project-1", fakeDb);

    expect(result?.rows.map((row) => row.shotId)).toEqual(["shot-4", "shot-2", "shot-3", "shot-1"]);
  });

  it("returns capture failures with their page and viewport resolved, in the grid's label order", async () => {
    const run = { id: "run-1", projectId: "project-1", status: "failed" } as Run;
    const shots: Shot[] = [
      {
        id: "shot-1",
        runId: "run-1",
        pageId: "page-a",
        viewportId: "viewport-x",
        storageKey: "key-1",
      } as Shot,
    ];
    // page-b has no shot at all - it must still be resolved for the failures.
    const pages: PageRow[] = [
      { id: "page-a", label: "Home" } as PageRow,
      { id: "page-b", label: "CV" } as PageRow,
    ];
    const viewports: Viewport[] = [
      { id: "viewport-x", label: "Desktop" } as Viewport,
      { id: "viewport-y", label: "Mobile" } as Viewport,
    ];
    const captureFailures: CaptureFailureRow[] = [
      {
        id: "cf-1",
        runId: "run-1",
        pageId: "page-b",
        viewportId: "viewport-y",
        kind: "not-html",
        message: "Server responded with application/pdf, not an HTML page",
      } as CaptureFailureRow,
      {
        id: "cf-2",
        runId: "run-1",
        pageId: "page-b",
        viewportId: "viewport-x",
        kind: "not-html",
        message: "Server responded with application/pdf, not an HTML page",
      } as CaptureFailureRow,
    ];

    const { fakeDb, calls } = createFakeDb({
      run,
      shots,
      pages,
      viewports,
      comparisons: [],
      captureFailures,
    });

    const result = await getRunResultData("run-1", "project-1", fakeDb);

    expect(calls.pagesFindMany).toBe(1);
    expect(calls.viewportsFindMany).toBe(1);
    expect(result?.failures).toEqual([
      {
        id: "cf-2",
        kind: "not-html",
        message: captureFailures[1]!.message,
        page: pages[1],
        viewport: viewports[0],
      },
      {
        id: "cf-1",
        kind: "not-html",
        message: captureFailures[0]!.message,
        page: pages[1],
        viewport: viewports[1],
      },
    ]);
  });
});

describe("buildRunGrid", () => {
  const home = { id: "page-a", label: "Home" } as PageRow;
  const pricing = { id: "page-b", label: "Pricing" } as PageRow;
  const desktop = { id: "viewport-x", label: "Desktop", width: 1200 } as Viewport;
  const mobile = { id: "viewport-y", label: "Mobile", width: 375 } as Viewport;

  // Every row needs a width/height, but no test in this block cares what
  // they are - only the shot/page/viewport identity drives the assertions.
  const shotFixture = (overrides: Partial<ResultRow> & Pick<ResultRow, "shotId" | "storageKey">): ResultRow =>
    ({ width: 1200, height: 800, ...overrides }) as ResultRow;

  it("interleaves shot and failure cards in one page/viewport order", () => {
    const rows: ResultRow[] = [
      shotFixture({ shotId: "shot-1", storageKey: "k1", page: home, viewport: desktop }),
      shotFixture({ shotId: "shot-2", storageKey: "k2", page: pricing, viewport: mobile }),
    ];
    const failures: FailureRow[] = [
      { id: "cf-1", kind: "timeout", message: "x", page: home, viewport: mobile },
      { id: "cf-2", kind: "timeout", message: "x", page: pricing, viewport: desktop },
    ];

    const grid = buildRunGrid(rows, failures);

    expect(grid.map((card) => `${card.kind}:${card.id}`)).toEqual([
      "shot:shot-1",
      "failure:cf-1",
      "failure:cf-2",
      "shot:shot-2",
    ]);
  });

  it("groups cards by page, keeping each group's widest-first viewport order", () => {
    const rows: ResultRow[] = [
      shotFixture({ shotId: "shot-1", storageKey: "k1", page: pricing, viewport: mobile }),
      shotFixture({ shotId: "shot-2", storageKey: "k2", page: home, viewport: mobile }),
      shotFixture({ shotId: "shot-3", storageKey: "k3", page: home, viewport: desktop }),
    ];
    const failures: FailureRow[] = [
      { id: "cf-1", kind: "timeout", message: "x", page: pricing, viewport: desktop },
    ];

    const groups = groupRunGrid(buildRunGrid(rows, failures));

    expect(groups.map((group) => group.page?.id)).toEqual(["page-a", "page-b"]);
    expect(groups.map((group) => group.cards.map((card) => card.id))).toEqual([
      ["shot-3", "shot-2"],
      ["cf-1", "shot-1"],
    ]);
  });

  it("keeps two pages with the same label as two groups", () => {
    const homeAgain = { id: "page-c", label: "Home" } as PageRow;
    const rows: ResultRow[] = [
      shotFixture({ shotId: "shot-1", storageKey: "k1", page: homeAgain, viewport: desktop }),
      shotFixture({ shotId: "shot-2", storageKey: "k2", page: home, viewport: desktop }),
      shotFixture({ shotId: "shot-3", storageKey: "k3", page: homeAgain, viewport: mobile }),
    ];

    const groups = groupRunGrid(buildRunGrid(rows, []));

    expect(groups.map((group) => [group.page?.id, group.cards.map((card) => card.id)])).toEqual([
      ["page-a", ["shot-2"]],
      ["page-c", ["shot-1", "shot-3"]],
    ]);
  });

  it("puts cards whose page row is gone into one trailing group", () => {
    const rows: ResultRow[] = [
      shotFixture({ shotId: "shot-1", storageKey: "k1", page: undefined, viewport: desktop }),
      shotFixture({ shotId: "shot-2", storageKey: "k2", page: home, viewport: desktop }),
    ];

    const groups = groupRunGrid(buildRunGrid(rows, []));

    expect(groups.map((group) => [group.page?.id, group.cards.map((card) => card.id)])).toEqual([
      ["page-a", ["shot-2"]],
      [undefined, ["shot-1"]],
    ]);
  });
});
