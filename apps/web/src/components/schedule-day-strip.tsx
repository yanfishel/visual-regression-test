"use client";

import type { ScheduleWindow } from "@vrt/shared/schedule";
import { dayStripLayout } from "@/lib/schedule-strip";

/**
 * The schedule as a picture: one 24-hour strip, the window shaded, a mark
 * at every run. `info` is the scheduled-trigger hue everywhere else in the
 * app (CLAUDE.md §9), so the marks wear it too. Colour is not the only
 * carrier - the axis is labelled, and the sentence under the strip lists
 * the same times in words (schedule-fields.tsx); the strip is decorative to
 * assistive tech (`aria-hidden`) for that reason.
 */
export function ScheduleDayStrip({ window, runsPerDay }: { window: ScheduleWindow; runsPerDay: number }) {
  const layout = dayStripLayout(window, runsPerDay);

  return (
    <div aria-hidden className="select-none pt-1">
      {/* The 00..24 axis sits above the track, faint - it only says which
          way the day runs. The run times themselves are the labels that
          matter, so they hang under their marks in the stronger tone. */}
      <div className="relative mb-1 h-3 font-mono text-[10px] leading-none text-text-faint">
        {layout.axis.map((tick, index) => (
          <span
            key={tick.label}
            className={`absolute ${
              index === 0 ? "" : index === layout.axis.length - 1 ? "-translate-x-full" : "-translate-x-1/2"
            }`}
            style={{ left: `${tick.pct}%` }}
          >
            {tick.label}
          </span>
        ))}
      </div>
      {/* The track clips the window shading to its rounded ends; the marks
          sit in the outer box so they can overhang the track's edge. */}
      <div className="relative h-5">
        <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-surface-alt">
          {layout.windowSegments.map((segment) => (
            <div
              key={segment.startPct}
              className="absolute inset-y-0 bg-info-soft"
              style={{ left: `${segment.startPct}%`, width: `${segment.widthPct}%` }}
            />
          ))}
        </div>
        {layout.marks.map((mark) => (
          <div
            key={mark.label}
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-info ring-2 ring-surface"
            style={{ left: `${mark.pct}%` }}
          />
        ))}
      </div>
      {/* One label per mark, centred under it. Crowded schedules deal the
          labels over 2-3 rows (schedule-strip.ts) so neighbours never
          overlap; a mark near either end is clamped inside the strip
          (translate 0 / -100%) instead of hanging past the dialog's edge. */}
      <div
        className="relative mt-1 font-mono text-[10px] leading-none text-text-muted"
        style={{ height: `${layout.labelRows * 12}px` }}
      >
        {layout.marks.map((mark) => (
          <span
            key={mark.label}
            className={`absolute ${mark.pct < 3 ? "" : mark.pct > 97 ? "-translate-x-full" : "-translate-x-1/2"}`}
            style={{ left: `${mark.pct}%`, top: `${mark.row * 12}px` }}
          >
            {mark.label}
          </span>
        ))}
      </div>
    </div>
  );
}
