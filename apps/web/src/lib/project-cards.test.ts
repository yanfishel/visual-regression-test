import { describe, expect, it } from "vitest";
import type { Comparison, Database, PageRow, ProjectSchedule, Run, Shot, Viewport } from "@vrt/db";
import { getProjectCardData } from "./project-cards.js";

function createFakeDb(fixtures: {
  pages: PageRow[];
  viewports: Viewport[];
  schedules: ProjectSchedule[];
  runs: Run[];
  shots: Shot[];
  comparisons: Comparison[];
}) {
  const calls = { pages: 0, viewports: 0, schedules: 0, runs: 0, shots: 0, comparisons: 0 };
  const fakeDb = {
    query: {
      pages: {
        findMany: async () => {
          calls.pages++;
          return fixtures.pages;
        },
      },
      viewports: {
        findMany: async () => {
          calls.viewports++;
          return fixtures.viewports;
        },
      },
      projectSchedules: {
        findMany: async () => {
          calls.schedules++;
          return fixtures.schedules;
        },
      },
      runs: {
        findMany: async () => {
          calls.runs++;
          return fixtures.runs;
        },
      },
      shots: {
        findMany: async () => {
          calls.shots++;
          return fixtures.shots;
        },
      },
      comparisons: {
        findMany: async () => {
          calls.comparisons++;
          return fixtures.comparisons;
        },
      },
    },
  } as unknown as Database;

  return { fakeDb, calls };
}

function run(id: string, projectId: string, status: Run["status"], createdAt: string): Run {
  return { id, projectId, status, createdAt: new Date(createdAt) } as Run;
}

function shot(id: string, runId: string, pageId: string, viewportId: string, storageKey: string): Shot {
  return { id, runId, pageId, viewportId, storageKey } as Shot;
}

function schedule(projectId: string, runsPerDay: number): ProjectSchedule {
  return { projectId, runsPerDay, window: "night", timeZone: "UTC" } as ProjectSchedule;
}

describe("getProjectCardData", () => {
  it("issues one batched query per table regardless of project count", async () => {
    const { fakeDb, calls } = createFakeDb({
      pages: [
        { id: "page-a", projectId: "p1", label: "Home" } as PageRow,
        { id: "page-b", projectId: "p2", label: "Docs" } as PageRow,
      ],
      viewports: [
        { id: "vp-x", projectId: "p1", label: "Desktop" } as Viewport,
        { id: "vp-y", projectId: "p2", label: "Mobile" } as Viewport,
      ],
      schedules: [schedule("p1", 3)],
      runs: [
        run("run-1", "p1", "done", "2026-08-14T10:00:00Z"),
        run("run-2", "p2", "done", "2026-08-14T11:00:00Z"),
      ],
      shots: [
        shot("shot-1", "run-1", "page-a", "vp-x", "key-1"),
        shot("shot-2", "run-2", "page-b", "vp-y", "key-2"),
      ],
      comparisons: [{ id: "cmp-1", shotId: "shot-1", status: "passed" } as Comparison],
    });

    const data = await getProjectCardData(["p1", "p2"], fakeDb);

    expect(calls).toEqual({ pages: 1, viewports: 1, schedules: 1, runs: 1, shots: 1, comparisons: 1 });
    expect(data.get("p1")?.schedule?.runsPerDay).toBe(3);
    expect(data.get("p2")?.schedule).toBeNull();
    expect(data.get("p1")?.pages.map((page) => page.id)).toEqual(["page-a"]);
    expect(data.get("p2")?.viewports.map((viewport) => viewport.id)).toEqual(["vp-y"]);
  });

  it("queries nothing for an empty project list", async () => {
    const { fakeDb, calls } = createFakeDb({
      pages: [],
      viewports: [],
      schedules: [],
      runs: [],
      shots: [],
      comparisons: [],
    });

    const data = await getProjectCardData([], fakeDb);

    expect(data.size).toBe(0);
    expect(calls).toEqual({ pages: 0, viewports: 0, schedules: 0, runs: 0, shots: 0, comparisons: 0 });
  });

  it("returns empty card data for a project with no runs", async () => {
    const { fakeDb } = createFakeDb({
      pages: [{ id: "page-a", projectId: "p1", label: "Home" } as PageRow],
      viewports: [],
      schedules: [],
      runs: [],
      shots: [],
      comparisons: [],
    });

    const data = await getProjectCardData(["p1"], fakeDb);

    expect(data.get("p1")).toEqual({
      pages: [{ id: "page-a", projectId: "p1", label: "Home" }],
      viewports: [],
      schedule: null,
      lastRun: null,
      lastFinishedRun: null,
      lastResult: null,
      previewStorageKey: null,
    });
  });

  it("reports the newest run as lastRun even when a finished run is older", async () => {
    const done = run("run-old", "p1", "done", "2026-08-14T10:00:00Z");
    const queued = run("run-new", "p1", "queued", "2026-08-14T11:00:00Z");
    const { fakeDb } = createFakeDb({
      pages: [{ id: "page-a", projectId: "p1", label: "Home" } as PageRow],
      viewports: [{ id: "vp-x", projectId: "p1", label: "Desktop" } as Viewport],
      schedules: [],
      runs: [queued, done],
      shots: [shot("shot-1", "run-old", "page-a", "vp-x", "key-old")],
      comparisons: [{ id: "cmp-1", shotId: "shot-1", status: "failed" } as Comparison],
    });

    const data = await getProjectCardData(["p1"], fakeDb);

    expect(data.get("p1")?.lastRun).toBe(queued);
    expect(data.get("p1")?.lastFinishedRun).toBe(done);
    expect(data.get("p1")?.lastResult).toEqual({ runId: "run-old", passed: 0, failed: 1, unreviewed: 0 });
    expect(data.get("p1")?.previewStorageKey).toBe("key-old");
  });

  it("counts approved comparisons as passed and new ones as unreviewed", async () => {
    const { fakeDb } = createFakeDb({
      pages: [{ id: "page-a", projectId: "p1", label: "Home" } as PageRow],
      viewports: [{ id: "vp-x", projectId: "p1", label: "Desktop" } as Viewport],
      schedules: [],
      runs: [run("run-1", "p1", "done", "2026-08-14T10:00:00Z")],
      shots: [
        shot("shot-1", "run-1", "page-a", "vp-x", "key-1"),
        shot("shot-2", "run-1", "page-a", "vp-x", "key-2"),
        shot("shot-3", "run-1", "page-a", "vp-x", "key-3"),
      ],
      comparisons: [
        { id: "cmp-1", shotId: "shot-1", status: "approved" } as Comparison,
        { id: "cmp-2", shotId: "shot-2", status: "passed" } as Comparison,
        { id: "cmp-3", shotId: "shot-3", status: "new" } as Comparison,
      ],
    });

    const data = await getProjectCardData(["p1"], fakeDb);

    expect(data.get("p1")?.lastResult).toEqual({ runId: "run-1", passed: 2, failed: 0, unreviewed: 1 });
  });

  it("picks the preview shot in run-grid order: page label, viewport widest first, shot id", async () => {
    const { fakeDb } = createFakeDb({
      pages: [
        { id: "page-z", projectId: "p1", label: "Zeta" } as PageRow,
        { id: "page-a", projectId: "p1", label: "Alpha" } as PageRow,
      ],
      viewports: [
        // "Mobile" sorts before "Tablet" alphabetically; the grid orders by width.
        { id: "vp-m", projectId: "p1", label: "Mobile", width: 375 } as Viewport,
        { id: "vp-t", projectId: "p1", label: "Tablet", width: 768 } as Viewport,
      ],
      schedules: [],
      runs: [run("run-1", "p1", "done", "2026-08-14T10:00:00Z")],
      shots: [
        shot("shot-1", "run-1", "page-z", "vp-t", "key-zeta"),
        shot("shot-2", "run-1", "page-a", "vp-m", "key-alpha-mobile"),
        shot("shot-3", "run-1", "page-a", "vp-t", "key-alpha-tablet"),
      ],
      comparisons: [],
    });

    const data = await getProjectCardData(["p1"], fakeDb);

    expect(data.get("p1")?.previewStorageKey).toBe("key-alpha-tablet");
  });

  it("uses the newest finished run for preview and result, skipping queued runs", async () => {
    const { fakeDb } = createFakeDb({
      pages: [{ id: "page-a", projectId: "p1", label: "Home" } as PageRow],
      viewports: [{ id: "vp-x", projectId: "p1", label: "Desktop" } as Viewport],
      schedules: [],
      runs: [
        run("run-1", "p1", "done", "2026-08-14T09:00:00Z"),
        run("run-2", "p1", "failed", "2026-08-14T10:00:00Z"),
        run("run-3", "p1", "running", "2026-08-14T11:00:00Z"),
      ],
      shots: [
        shot("shot-1", "run-1", "page-a", "vp-x", "key-earlier"),
        shot("shot-2", "run-2", "page-a", "vp-x", "key-latest"),
      ],
      comparisons: [{ id: "cmp-1", shotId: "shot-2", status: "failed" } as Comparison],
    });

    const data = await getProjectCardData(["p1"], fakeDb);

    expect(data.get("p1")?.previewStorageKey).toBe("key-latest");
    expect(data.get("p1")?.lastFinishedRun?.status).toBe("failed");
    expect(data.get("p1")?.lastResult).toEqual({ runId: "run-2", passed: 0, failed: 1, unreviewed: 0 });
  });
});
