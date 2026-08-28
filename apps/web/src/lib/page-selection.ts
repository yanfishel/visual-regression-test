import type { PageInput } from "@vrt/shared/schemas";
import type { PageRow } from "@vrt/db";

// A page row as the project dialog submits it: an id means "this is an
// existing page", no id means "a row the user just added".
export interface PageDraftInput extends PageInput {
  id?: string;
}

export interface PageUpdate {
  id: string;
  label: string;
  path: string;
  waitSelector: string | null;
  maskSelectors: string[];
}

export interface PageSelectionDiff {
  toInsert: Omit<PageUpdate, "id">[];
  toUpdate: PageUpdate[];
  toDeleteIds: string[];
}

// Existing pages are updated in place rather than replaced, so their shots and
// baselines survive a rename or a mask-selector tweak.
export function diffPageSelection(existing: PageRow[], drafts: PageDraftInput[]): PageSelectionDiff {
  const existingById = new Map(existing.map((page) => [page.id, page]));
  const keptIds = new Set<string>();

  const toInsert: Omit<PageUpdate, "id">[] = [];
  const toUpdate: PageUpdate[] = [];

  for (const draft of drafts) {
    const next = {
      label: draft.label,
      path: draft.path,
      waitSelector: draft.waitSelector || null,
      maskSelectors: draft.maskSelectors,
    };

    if (draft.id === undefined) {
      toInsert.push(next);
      continue;
    }

    const current = existingById.get(draft.id);
    if (!current) {
      // The dialog only ever submits ids it was given, so an unknown one means
      // a stale form or a page id from another project - never silently apply it.
      throw new Error(`Unknown page ${draft.id}`);
    }

    keptIds.add(draft.id);
    if (hasChanged(current, next)) {
      toUpdate.push({ id: draft.id, ...next });
    }
  }

  const toDeleteIds = existing.filter((page) => !keptIds.has(page.id)).map((page) => page.id);

  return { toInsert, toUpdate, toDeleteIds };
}

function hasChanged(current: PageRow, next: Omit<PageUpdate, "id">): boolean {
  return (
    current.label !== next.label ||
    current.path !== next.path ||
    (current.waitSelector ?? null) !== next.waitSelector ||
    current.maskSelectors.length !== next.maskSelectors.length ||
    current.maskSelectors.some((selector, index) => selector !== next.maskSelectors[index])
  );
}
