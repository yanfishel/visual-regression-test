"use client";

import type { RegionEntry, RegionReport, RegionStatus } from "@vrt/shared/regions";
import { formatDiffScore } from "@/lib/diff-score";
import { regionEntryId } from "./region-overlay";

// Status words in text, beside a swatch that repeats the overlay's colour
// and dash pattern - the same two carriers as the rectangles themselves.
const STATUS_TEXT: Record<RegionStatus, string> = {
  unchanged: "text-text-faint",
  moved: "text-info",
  changed: "text-danger",
  resized: "text-danger",
  added: "text-warning",
  removed: "text-warning",
};
const SWATCH_DASH: Partial<Record<RegionStatus, string>> = { added: "6 4", removed: "6 4", moved: "2 3" };
const SWATCH_STROKE: Record<RegionStatus, string> = {
  unchanged: "var(--border)",
  moved: "var(--info)",
  changed: "var(--danger)",
  resized: "var(--danger)",
  added: "var(--warning)",
  removed: "var(--warning)",
};

export function RegionList({
  report,
  highlightedKey,
  selectedKey,
  onHighlight,
  onSelect,
}: {
  report: RegionReport;
  highlightedKey: string | null;
  selectedKey: string | null;
  onHighlight: (id: string | null) => void;
  onSelect: (id: string, entry: RegionEntry) => void;
}) {
  if (report.entries.length === 0) {
    return null;
  }
  return (
    <ul
      className="max-h-48 divide-y divide-border overflow-y-auto border-t border-border text-sm"
      aria-label="Regions"
      onMouseLeave={() => onHighlight(null)}
    >
      {report.entries.map((entry, index) => {
        const id = regionEntryId(entry, index);
        const selected = id === selectedKey;
        const dimmed = entry.status === "unchanged";
        return (
          <li key={id}>
            <button
              type="button"
              aria-current={selected ? "true" : undefined}
              onMouseEnter={() => onHighlight(id)}
              onFocus={() => onHighlight(id)}
              onBlur={() => onHighlight(null)}
              onClick={() => onSelect(id, entry)}
              className={[
                "flex w-full items-center gap-3 px-3 py-1.5 text-left hover:bg-surface-alt",
                // A left border marks the selected row - the shared
                // bg-surface-alt alone doesn't distinguish it from a hover.
                selected ? "border-l-2 border-accent" : "border-l-2 border-transparent",
                selected ? "bg-surface-alt" : "",
                dimmed ? "text-text-muted" : "",
                id === highlightedKey ? "bg-surface-alt" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <svg aria-hidden className="h-3 w-5 shrink-0" viewBox="0 0 20 12">
                <rect
                  x="1"
                  y="1"
                  width="18"
                  height="10"
                  fill="none"
                  stroke={SWATCH_STROKE[entry.status]}
                  strokeWidth="2"
                  strokeDasharray={SWATCH_DASH[entry.status]}
                  strokeOpacity={dimmed ? 0.6 : 1}
                />
              </svg>
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{entry.label}</span>
              <span className={`shrink-0 text-xs font-semibold ${STATUS_TEXT[entry.status]}`}>
                {entry.status}
              </span>
              <span className="w-14 shrink-0 text-right font-mono text-xs text-text-muted">
                {entry.diffScore != null ? formatDiffScore(entry.diffScore, 2) : ""}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
