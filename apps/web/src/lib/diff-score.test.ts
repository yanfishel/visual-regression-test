import { describe, expect, it } from "vitest";
import { formatDiffScore } from "./diff-score.js";

describe("formatDiffScore", () => {
  it("drops trailing zeros after rounding", () => {
    expect(formatDiffScore(0, 2)).toBe("0%");
    expect(formatDiffScore(2.7, 2)).toBe("2.7%");
    expect(formatDiffScore(2.72, 2)).toBe("2.72%");
    expect(formatDiffScore(6.9, 3)).toBe("6.9%");
  });

  it("rounds to the given number of decimals", () => {
    expect(formatDiffScore(2.7249, 2)).toBe("2.72%");
    expect(formatDiffScore(0.0004, 2)).toBe("0%");
    expect(formatDiffScore(0.0125, 3)).toBe("0.013%");
  });
});
