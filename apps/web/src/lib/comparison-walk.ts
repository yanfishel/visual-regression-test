import { isPendingApproval } from "./approve-comparisons.js";

// One stop of a run's comparison walk (prev/next, the position counter and
// its jump list): enough to name it and colour its status dot.
export interface ComparisonSibling {
  id: string;
  pageLabel: string;
  viewportLabel: string;
  status: string;
}

// The comparison page's "approve, then move on" step: after approving stop
// `index` of a run's comparison walk (grid order - the same list prev/next
// walk), the next stop still waiting for a decision. Forward first, then
// wrapping around to anything left behind, so a reviewer who started
// mid-run still ends the pass having seen every pending diff. Null when the
// run has nothing left to decide - the page then stays put.
export function nextPendingComparisonId(
  walk: readonly { id: string; status: string }[],
  index: number,
): string | null {
  const after = walk.slice(index + 1).find((stop) => isPendingApproval(stop.status));
  if (after) {
    return after.id;
  }
  const before = walk.slice(0, Math.max(0, index)).find((stop) => isPendingApproval(stop.status));
  return before?.id ?? null;
}
