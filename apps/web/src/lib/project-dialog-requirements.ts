import { joinWithAnd } from "./schedule-display";

// What the project dialog's Save button needs before it can submit, named
// individually rather than folded into one boolean - a disabled button says
// nothing on its own, and this is the one place the reasons are put into
// words so the dialog's footer (and only the footer) has to render them.
export interface ProjectDraftSummary {
  name: string;
  baseUrl: string;
  presetCount: number;
  filledPageCount: number;
}

/**
 * The requirements still unmet, phrased for a reader and in the order the
 * fields appear in the dialog. The page phrase is deliberately specific
 * ("with a label and a path") rather than just "a page" - a row with only a
 * label typed in is a page on screen that still doesn't count, and that is
 * exactly the case nothing used to explain.
 */
export function missingProjectRequirements(draft: ProjectDraftSummary): string[] {
  const missing: string[] = [];
  if (draft.name.trim().length === 0) {
    missing.push("a name");
  }
  if (draft.baseUrl.trim().length === 0) {
    missing.push("a base URL");
  }
  if (draft.presetCount === 0) {
    missing.push("at least one viewport");
  }
  if (draft.filledPageCount === 0) {
    missing.push("at least one page with a label and a path");
  }
  return missing;
}

/**
 * The footer hint's sentence, or `null` when nothing is missing - so the
 * component can render straight off this instead of re-deriving "is the list
 * empty" itself.
 */
export function describeMissingProjectRequirements(draft: ProjectDraftSummary): string | null {
  const missing = missingProjectRequirements(draft);
  if (missing.length === 0) {
    return null;
  }
  return `Still needed: ${joinWithAnd(missing)}.`;
}

/**
 * Which of the dialog's tabs still hold an unmet requirement - the tab strip
 * marks them so the reader knows where to go without opening each one. The
 * grouping mirrors the tabs (General = name, URL, viewports; Pages = the
 * page list; Schedule never gates a save), and reads off
 * missingProjectRequirements' inputs so the two can't disagree about what
 * counts as filled.
 */
export function incompleteProjectSections(draft: ProjectDraftSummary): { general: boolean; pages: boolean } {
  return {
    general: draft.name.trim().length === 0 || draft.baseUrl.trim().length === 0 || draft.presetCount === 0,
    pages: draft.filledPageCount === 0,
  };
}
