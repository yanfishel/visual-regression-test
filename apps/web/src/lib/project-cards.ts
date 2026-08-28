import { inArray } from "drizzle-orm";
import { compareGridOrder } from "./grid-order.js";
import {
  comparisons,
  db,
  pages,
  projectSchedules,
  runs,
  shots,
  viewports,
  type Comparison,
  type Database,
  type PageRow,
  type ProjectSchedule,
  type Run,
  type Shot,
  type Viewport,
} from "@vrt/db";

export interface ProjectCardResult {
  runId: string;
  passed: number;
  failed: number;
  unreviewed: number;
}

export interface ProjectCardData {
  pages: PageRow[];
  viewports: Viewport[];
  schedule: ProjectSchedule | null;
  lastRun: Run | null;
  // Newest finished (done/failed) run - the newest run overall may still be
  // queued or running and have nothing to report yet. Its status matters on
  // its own: a worker-errored run can have zero comparisons, so the counts
  // below can't tell "failed" from "all passed".
  lastFinishedRun: Run | null;
  // Comparison outcome of that same finished run.
  lastResult: ProjectCardResult | null;
  previewStorageKey: string | null;
}

// Everything the /projects cards need, in six batched queries total no
// matter how many projects the list shows - the same fan-out-free shape as
// getRunResultData.
export async function getProjectCardData(
  projectIds: string[],
  database: Database = db,
): Promise<Map<string, ProjectCardData>> {
  const data = new Map<string, ProjectCardData>();
  if (projectIds.length === 0) {
    return data;
  }
  for (const projectId of projectIds) {
    data.set(projectId, {
      pages: [],
      viewports: [],
      schedule: null,
      lastRun: null,
      lastFinishedRun: null,
      lastResult: null,
      previewStorageKey: null,
    });
  }

  const [pageRows, viewportRows, scheduleRows, runRows] = await Promise.all([
    database.query.pages.findMany({
      where: inArray(pages.projectId, projectIds),
      orderBy: (page, { asc }) => asc(page.createdAt),
    }),
    database.query.viewports.findMany({
      where: inArray(viewports.projectId, projectIds),
      orderBy: (viewport, { asc }) => asc(viewport.createdAt),
    }),
    database.query.projectSchedules.findMany({
      where: inArray(projectSchedules.projectId, projectIds),
    }),
    database.query.runs.findMany({
      where: inArray(runs.projectId, projectIds),
    }),
  ]);

  for (const page of pageRows) {
    data.get(page.projectId)?.pages.push(page);
  }
  for (const viewport of viewportRows) {
    data.get(viewport.projectId)?.viewports.push(viewport);
  }
  for (const schedule of scheduleRows) {
    const card = data.get(schedule.projectId);
    if (card) {
      card.schedule = schedule;
    }
  }

  // Newest run overall drives the status pill; the newest finished run is
  // the one whose shots and comparisons the card previews and summarizes.
  const finishedRunByProject = new Map<string, Run>();
  for (const run of runRows) {
    const card = data.get(run.projectId);
    if (!card) {
      continue;
    }
    if (!card.lastRun || run.createdAt > card.lastRun.createdAt) {
      card.lastRun = run;
    }
    if (run.status === "done" || run.status === "failed") {
      const current = finishedRunByProject.get(run.projectId);
      if (!current || run.createdAt > current.createdAt) {
        finishedRunByProject.set(run.projectId, run);
      }
    }
  }

  const finishedRuns = [...finishedRunByProject.values()];
  if (finishedRuns.length === 0) {
    return data;
  }

  const shotRows = await database.query.shots.findMany({
    where: inArray(
      shots.runId,
      finishedRuns.map((run) => run.id),
    ),
  });
  const comparisonRows: Comparison[] =
    shotRows.length === 0
      ? []
      : await database.query.comparisons.findMany({
          where: inArray(
            comparisons.shotId,
            shotRows.map((shot) => shot.id),
          ),
        });

  const shotsByRunId = new Map<string, Shot[]>();
  for (const shot of shotRows) {
    const list = shotsByRunId.get(shot.runId);
    if (list) {
      list.push(shot);
    } else {
      shotsByRunId.set(shot.runId, [shot]);
    }
  }
  const comparisonByShotId = new Map(comparisonRows.map((comparison) => [comparison.shotId, comparison]));

  for (const [projectId, finishedRun] of finishedRunByProject) {
    const card = data.get(projectId);
    if (!card) {
      continue;
    }
    card.lastFinishedRun = finishedRun;
    const runShots = shotsByRunId.get(finishedRun.id) ?? [];

    const result: ProjectCardResult = { runId: finishedRun.id, passed: 0, failed: 0, unreviewed: 0 };
    for (const shot of runShots) {
      const status = comparisonByShotId.get(shot.id)?.status;
      if (status === "passed" || status === "approved") {
        result.passed++;
      } else if (status === "failed") {
        result.failed++;
      } else if (status === "new") {
        result.unreviewed++;
      }
    }
    card.lastResult = result;
    card.previewStorageKey = pickPreviewShot(runShots, card.pages, card.viewports)?.storageKey ?? null;
  }

  return data;
}

// Same deterministic order as the run-results grid (`compareGridOrder`:
// page label, viewport widest first, shot id), so the card's preview is the
// run page's first card.
function pickPreviewShot(runShots: Shot[], pageRows: PageRow[], viewportRows: Viewport[]): Shot | null {
  if (runShots.length === 0) {
    return null;
  }
  const pageById = new Map(pageRows.map((page) => [page.id, page]));
  const viewportById = new Map(viewportRows.map((viewport) => [viewport.id, viewport]));

  const [first] = runShots
    .map((shot) => ({ shot, page: pageById.get(shot.pageId), viewport: viewportById.get(shot.viewportId) }))
    .sort((a, b) => compareGridOrder(a, b, (entry) => entry.shot.id));
  return first?.shot ?? null;
}
