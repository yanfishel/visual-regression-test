import { eq, inArray } from "drizzle-orm";
import {
  captureFailures,
  comparisons,
  db,
  pages,
  runs,
  shots,
  viewports,
  type Comparison,
  type Database,
  type PageRow,
  type Run,
  type Viewport,
} from "@vrt/db";
import type { CaptureFailureKind } from "@vrt/shared";
// Relative (not `@/lib`) so vitest, which has no path alias, can load this module.
import { compareGridOrder } from "../../../../../../lib/grid-order.js";

export interface ResultRow {
  shotId: string;
  storageKey: string;
  width: number;
  height: number;
  page?: PageRow;
  viewport?: Viewport;
  comparison?: Comparison;
}

// A page/viewport pair the worker couldn't capture - shown in the run grid as
// a card of its own, but kept apart from `rows` so the comparison viewer's
// prev/next (which walks `rows`) never lands on it.
export interface FailureRow {
  id: string;
  kind: CaptureFailureKind;
  message: string;
  page?: PageRow;
  viewport?: Viewport;
}

export interface RunResultData {
  run: Run;
  rows: ResultRow[];
  failures: FailureRow[];
}

// One card per grid slot: a shot or a capture failure, interleaved in one
// label order so a page that failed on mobile still sits next to its desktop
// shot. Only the run page's grid reads this - the comparison viewer's
// prev/next walks `rows` alone.
export type GridCard = { id: string; page?: PageRow; viewport?: Viewport } & (
  { kind: "shot"; row: ResultRow } | { kind: "failure"; failure: FailureRow }
);

export function buildRunGrid(rows: ResultRow[], failures: FailureRow[]): GridCard[] {
  const cards: GridCard[] = [
    ...rows.map((row) => ({
      kind: "shot" as const,
      id: row.shotId,
      page: row.page,
      viewport: row.viewport,
      row,
    })),
    ...failures.map((failure) => ({
      kind: "failure" as const,
      id: failure.id,
      page: failure.page,
      viewport: failure.viewport,
      failure,
    })),
  ];
  return cards.sort((a, b) => compareGridOrder(a, b, (card) => card.id));
}

// The run page renders the grid as one section per page (label heading, then
// that page's cards, one per viewport). Consecutive cards of the same page
// are already adjacent because `buildRunGrid` sorts page-first, so this is a
// single pass; `page` is undefined for the trailing group of cards whose
// page row was deleted.
export interface GridGroup {
  page?: PageRow;
  cards: GridCard[];
}

export function groupRunGrid(cards: GridCard[]): GridGroup[] {
  const groups: GridGroup[] = [];
  for (const card of cards) {
    const last = groups[groups.length - 1];
    if (last && last.page?.id === card.page?.id) {
      last.cards.push(card);
    } else {
      groups.push({ page: card.page, cards: [card] });
    }
  }
  return groups;
}

export async function getRunResultData(
  runId: string,
  projectId: string,
  database: Database = db,
): Promise<RunResultData | null> {
  const run = await database.query.runs.findFirst({ where: eq(runs.id, runId) });
  if (!run || run.projectId !== projectId) {
    return null;
  }

  const [runShots, runFailures] = await Promise.all([
    database.query.shots.findMany({ where: eq(shots.runId, runId) }),
    database.query.captureFailures.findMany({ where: eq(captureFailures.runId, runId) }),
  ]);

  const pageIds = [...new Set([...runShots, ...runFailures].map((row) => row.pageId))];
  const viewportIds = [...new Set([...runShots, ...runFailures].map((row) => row.viewportId))];
  const shotIds = runShots.map((shot) => shot.id);

  const [pageRows, viewportRows, comparisonRows] = await Promise.all([
    pageIds.length ? database.query.pages.findMany({ where: inArray(pages.id, pageIds) }) : [],
    viewportIds.length
      ? database.query.viewports.findMany({ where: inArray(viewports.id, viewportIds) })
      : [],
    shotIds.length
      ? database.query.comparisons.findMany({ where: inArray(comparisons.shotId, shotIds) })
      : [],
  ]);

  const pageById = new Map(pageRows.map((page) => [page.id, page]));
  const viewportById = new Map(viewportRows.map((viewport) => [viewport.id, viewport]));
  const comparisonByShotId = new Map(comparisonRows.map((comparison) => [comparison.shotId, comparison]));

  const rows: ResultRow[] = runShots
    .map((shot) => ({
      shotId: shot.id,
      storageKey: shot.storageKey,
      width: shot.width,
      height: shot.height,
      page: pageById.get(shot.pageId),
      viewport: viewportById.get(shot.viewportId),
      comparison: comparisonByShotId.get(shot.id),
    }))
    .sort((a, b) => compareGridOrder(a, b, (row) => row.shotId));

  const failures: FailureRow[] = runFailures
    .map((failure) => ({
      id: failure.id,
      kind: failure.kind,
      message: failure.message,
      page: pageById.get(failure.pageId),
      viewport: viewportById.get(failure.viewportId),
    }))
    .sort((a, b) => compareGridOrder(a, b, (row) => row.id));

  return { run, rows, failures };
}
