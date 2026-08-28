import type { PageRow, Shot, Viewport } from "@vrt/db";
import { compareGridOrder } from "./grid-order.js";

export interface RunSlide {
  shotId: string;
  storageKey: string;
  pageLabel: string;
  viewportLabel: string;
}

// Slides for the project page's shot slider, in the same deterministic order
// as the run-results grid (`compareGridOrder`: page label, viewport widest
// first, shot id), so flipping through the slider walks the run page
// top-to-bottom.
export function buildRunSlides(
  runShots: Pick<Shot, "id" | "storageKey" | "pageId" | "viewportId">[],
  pageRows: Pick<PageRow, "id" | "label">[],
  viewportRows: Pick<Viewport, "id" | "label" | "width">[],
): RunSlide[] {
  const pageById = new Map(pageRows.map((page) => [page.id, page]));
  const viewportById = new Map(viewportRows.map((viewport) => [viewport.id, viewport]));

  return runShots
    .map((shot) => ({
      shotId: shot.id,
      storageKey: shot.storageKey,
      page: pageById.get(shot.pageId),
      viewport: viewportById.get(shot.viewportId),
    }))
    .sort((a, b) => compareGridOrder(a, b, (entry) => entry.shotId))
    .map(({ shotId, storageKey, page, viewport }) => ({
      shotId,
      storageKey,
      pageLabel: page?.label ?? "",
      viewportLabel: viewport?.label ?? "",
    }));
}
