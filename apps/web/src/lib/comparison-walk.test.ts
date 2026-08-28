import { describe, expect, it } from "vitest";
import { nextPendingComparisonId } from "./comparison-walk.js";

const walk = (statuses: string[]) => statuses.map((status, i) => ({ id: `cmp-${i}`, status }));

describe("nextPendingComparisonId", () => {
  it("prefers the first pending stop after the current one", () => {
    expect(nextPendingComparisonId(walk(["failed", "approved", "passed", "new", "failed"]), 1)).toBe("cmp-3");
  });

  it("wraps to the first pending stop before the current one when nothing pending follows", () => {
    expect(nextPendingComparisonId(walk(["passed", "failed", "approved", "passed"]), 2)).toBe("cmp-1");
  });

  it("never returns the current stop, even while it is still pending", () => {
    expect(nextPendingComparisonId(walk(["passed", "failed", "passed"]), 1)).toBeNull();
  });

  it("returns null when nothing is pending", () => {
    expect(nextPendingComparisonId(walk(["approved", "passed"]), 0)).toBeNull();
    expect(nextPendingComparisonId([], -1)).toBeNull();
  });
});
