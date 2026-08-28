// CLAUDE.md section 4 promises that a page or viewport whose shots are still
// an approved baseline can't be removed. The schema declares that intent
// (baselines.shot_id is ON DELETE RESTRICT), but Postgres fires RI triggers
// in constraint-creation order: deleting a page first cascade-deletes its
// baselines row, and only then its shots - by which point RESTRICT finds
// nothing to protect. So the guard has to run in application code, before
// the delete, instead of relying on the FK to fire.

export class BaselineProtectedError extends Error {
  constructor() {
    super("Can't remove a page or viewport whose shots are still an approved baseline.");
    this.name = "BaselineProtectedError";
  }
}

export function findBaselineConflicts(
  baselineRows: readonly { pageId: string; viewportId: string }[],
  pageIdsToDelete: readonly string[],
  viewportIdsToDelete: readonly string[],
): boolean {
  const deletedPages = new Set(pageIdsToDelete);
  const deletedViewports = new Set(viewportIdsToDelete);
  return baselineRows.some((row) => deletedPages.has(row.pageId) || deletedViewports.has(row.viewportId));
}
