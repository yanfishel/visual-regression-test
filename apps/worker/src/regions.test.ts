import { describe, expect, it } from "vitest";
import { clipRegions } from "./regions.js";

const base = { key: "section", label: "section" };

describe("clipRegions", () => {
  it("rounds each edge independently, so the size can shift by one", () => {
    // Edges round independently, so two regions that share an edge in the DOM still share it after rounding.
    expect(clipRegions([{ ...base, x: 10.4, y: 20.6, width: 100.2, height: 50.5 }], 1200, 800)).toEqual([
      { ...base, x: 10, y: 21, width: 101, height: 50 },
    ]);
  });

  it("clips a rect that overhangs the image to the image's edges", () => {
    expect(clipRegions([{ ...base, x: -20, y: 700, width: 100, height: 200 }], 1200, 800)).toEqual([
      { ...base, x: 0, y: 700, width: 80, height: 100 },
    ]);
  });

  it("drops a rect entirely outside the image, or empty after clipping", () => {
    expect(
      clipRegions(
        [
          { ...base, x: 0, y: 900, width: 100, height: 50 },
          { ...base, x: 1200, y: 0, width: 10, height: 10 },
          { ...base, x: 0, y: 0, width: 0.2, height: 50 },
        ],
        1200,
        800,
      ),
    ).toEqual([]);
  });
});
