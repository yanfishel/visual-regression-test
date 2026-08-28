import { runTimesFor, SCHEDULE_WINDOW_HOURS, type ScheduleWindow } from "@vrt/shared/schedule";

// Imported by a client component, so this module stays free of @vrt/db and
// of the @vrt/shared root barrel (CLAUDE.md §9 trap index).

export interface DayStripLayout {
  /** The schedule window, as horizontal spans of the 24 h strip (0..100 %). */
  windowSegments: { startPct: number; widthPct: number }[];
  /** One mark per run, positioned by its minute of the day; `row` is the
   *  label row it sits on (see labelRowsFor). */
  marks: { pct: number; label: string; row: number }[];
  /** How many label rows the marks are spread over. */
  labelRows: number;
  /** Axis ticks every six hours, "00" .. "24". */
  axis: { pct: number; label: string }[];
}

const MINUTES_PER_DAY = 24 * 60;

/**
 * Every mark carries its own "HH:MM" under the strip, and at one an hour
 * (the ceiling - CLAUDE.md §4) 24 labels do not fit on one line, so they
 * are dealt round-robin over two rows above 8 marks and three above 16 -
 * neighbours then sit on different rows and no label overlaps the next.
 * Thresholds picked so the strip's narrowest real width (the dialog on a
 * phone, ~330 px) still separates neighbours on the same row by ~40 px.
 */
export function labelRowsFor(runsPerDay: number): number {
  return runsPerDay <= 8 ? 1 : runsPerDay <= 16 ? 2 : 3;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Where the dialog's 24-hour strip paints the window and the runs. Derived
 * from runTimesFor - the same function computeNextRunAt picks occurrences
 * with - so the picture can never drift from what the schedule really does.
 * A window that wraps midnight (night: 20:00 → 08:00) becomes two segments,
 * evening then morning, since the strip runs 00 → 24 left to right.
 */
export function dayStripLayout(window: ScheduleWindow, runsPerDay: number): DayStripLayout {
  const { start, length } = SCHEDULE_WINDOW_HOURS[window];
  const end = start + length;
  const windowSegments =
    end <= 24
      ? [{ startPct: (start / 24) * 100, widthPct: (length / 24) * 100 }]
      : [
          { startPct: (start / 24) * 100, widthPct: ((24 - start) / 24) * 100 },
          { startPct: 0, widthPct: ((end - 24) / 24) * 100 },
        ];

  const labelRows = labelRowsFor(runsPerDay);
  const marks = runTimesFor(window, runsPerDay).map((time, index) => ({
    pct: ((time.hour * 60 + time.minute) / MINUTES_PER_DAY) * 100,
    label: `${pad(time.hour)}:${pad(time.minute)}`,
    row: index % labelRows,
  }));

  const axis = [0, 6, 12, 18, 24].map((hour) => ({ pct: (hour / 24) * 100, label: pad(hour) }));

  return { windowSegments, marks, labelRows, axis };
}
