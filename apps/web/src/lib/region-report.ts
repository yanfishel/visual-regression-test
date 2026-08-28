import { summarizeRegionReport, type RegionReport, type RegionStatus } from "@vrt/shared/regions";

// The jsonb parser lives in shared (the worker reads the same column); the
// web side only adds the display helpers.
export { parseRegionReport } from "@vrt/shared/regions";

// Worst news first; `unchanged` is never summarised - a card that says
// "12 unchanged" says nothing.
const SUMMARY_ORDER: RegionStatus[] = ["changed", "resized", "moved", "added", "removed"];

export function formatRegionSummary(report: RegionReport | null): string | null {
  if (!report) {
    return null;
  }
  const counts = summarizeRegionReport(report);
  const parts = SUMMARY_ORDER.filter((status) => counts[status] > 0).map(
    (status) => `${counts[status]} ${status}`,
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}
