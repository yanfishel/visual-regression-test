import { describe, expect, it } from "vitest";
import { dayStripLayout, labelRowsFor } from "./schedule-strip.js";

describe("dayStripLayout", () => {
  it("shades the day window as one segment and marks the runs inside it", () => {
    const layout = dayStripLayout("day", 2);
    expect(layout.windowSegments).toEqual([{ startPct: (8 / 24) * 100, widthPct: 50 }]);
    // runTimesFor("day", 2) is 11:00 and 17:00.
    expect(layout.marks).toEqual([
      { pct: (11 / 24) * 100, label: "11:00", row: 0 },
      { pct: (17 / 24) * 100, label: "17:00", row: 0 },
    ]);
    expect(layout.labelRows).toBe(1);
  });

  it("splits the night window at midnight into two segments", () => {
    const layout = dayStripLayout("night", 1);
    expect(layout.windowSegments).toEqual([
      { startPct: (20 / 24) * 100, widthPct: (4 / 24) * 100 },
      { startPct: 0, widthPct: (8 / 24) * 100 },
    ]);
    // A single night run is centred in the window: 02:00.
    expect(layout.marks).toEqual([{ pct: (2 / 24) * 100, label: "02:00", row: 0 }]);
  });

  it("covers the whole strip for the any window", () => {
    expect(dayStripLayout("any", 24).windowSegments).toEqual([{ startPct: 0, widthPct: 100 }]);
    expect(dayStripLayout("any", 24).marks).toHaveLength(24);
  });

  it("deals crowded labels round-robin over more rows", () => {
    expect(labelRowsFor(8)).toBe(1);
    expect(labelRowsFor(9)).toBe(2);
    expect(labelRowsFor(16)).toBe(2);
    expect(labelRowsFor(17)).toBe(3);
    const layout = dayStripLayout("any", 24);
    expect(layout.labelRows).toBe(3);
    expect(layout.marks.map((mark) => mark.row).slice(0, 7)).toEqual([0, 1, 2, 0, 1, 2, 0]);
  });

  it("labels the axis at every six hours", () => {
    expect(dayStripLayout("day", 1).axis).toEqual([
      { pct: 0, label: "00" },
      { pct: 25, label: "06" },
      { pct: 50, label: "12" },
      { pct: 75, label: "18" },
      { pct: 100, label: "24" },
    ]);
  });
});
