// The one deterministic order every run-scoped list shares: the run page's
// results grid, the comparison viewer's prev/next walk and the project page's
// shot slider all sort through `compareGridOrder`, so flipping through any of
// them walks the run top-to-bottom in the same sequence (CLAUDE.md §4,
// "Run-result ordering"). Plain module - no React, no DB - so it can be
// imported from `lib/*` helpers and route `data.ts` files alike.

export interface GridPage {
  id: string;
  label: string;
}

export interface GridViewport {
  label: string;
  width: number;
}

export interface GridEntry {
  page?: GridPage;
  viewport?: GridViewport;
}

// Pages order by label; a card whose page row is gone sorts last so
// `groupRunGrid` can collect those into one trailing group. Two pages with
// the same label still form two groups (they have different ids), so the id
// is part of the key - otherwise their cards would interleave into one.
function comparePages(a: GridPage | undefined, b: GridPage | undefined): number {
  if (!a || !b) {
    return (a ? 0 : 1) - (b ? 0 : 1);
  }
  return a.label.localeCompare(b.label) || a.id.localeCompare(b.id);
}

// Within a page, viewports order widest first (Desktop → Tablet → Mobile,
// the preset order), label as the tiebreaker for equal widths.
function compareViewports(a: GridViewport | undefined, b: GridViewport | undefined): number {
  if (!a || !b) {
    return (a ? 0 : 1) - (b ? 0 : 1);
  }
  return b.width - a.width || a.label.localeCompare(b.label);
}

// Page first, then viewport: the run page groups cards by page, and prev/next
// must walk group by group to agree with it. `idOf` is a final tiebreaker:
// page/viewport labels have no DB uniqueness constraint, and without it two
// equal-label rows fall back to Array.prototype.sort's stability, which just
// preserves the DB's (unordered) return order - not guaranteed to match
// between one screen's request and another's. Shots and capture failures
// share it so both kinds of card interleave in one predictable sequence.
export function compareGridOrder<T extends GridEntry>(a: T, b: T, idOf: (entry: T) => string): number {
  const pageCompare = comparePages(a.page, b.page);
  if (pageCompare !== 0) {
    return pageCompare;
  }
  const viewportCompare = compareViewports(a.viewport, b.viewport);
  if (viewportCompare !== 0) {
    return viewportCompare;
  }
  return idOf(a).localeCompare(idOf(b));
}
