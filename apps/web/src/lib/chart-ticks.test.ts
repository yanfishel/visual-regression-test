import { describe, expect, it } from "vitest";
import { formatCompact } from "./chart-ticks.js";

describe("formatCompact", () => {
  it("leaves small values as plain digits", () => {
    expect(formatCompact(3)).toBe("3");
    expect(formatCompact(200)).toBe("200");
  });

  it("abbreviates thousands so chart labels stay narrow", () => {
    expect(formatCompact(1_000)).toBe("1K");
    expect(formatCompact(1_200)).toBe("1.2K");
    expect(formatCompact(25_000)).toBe("25K");
  });
});
