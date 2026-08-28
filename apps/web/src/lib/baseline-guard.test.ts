import { describe, expect, it } from "vitest";
import { findBaselineConflicts } from "./baseline-guard";

const baseline = (pageId: string, viewportId: string) => ({ pageId, viewportId });

describe("findBaselineConflicts", () => {
  it("reports no conflict when nothing is being deleted", () => {
    expect(findBaselineConflicts([baseline("p1", "v1")], [], [])).toBe(false);
  });

  it("reports no conflict when deleted rows own no baseline", () => {
    expect(findBaselineConflicts([baseline("p1", "v1")], ["p2"], ["v2"])).toBe(false);
  });

  it("reports a conflict when a deleted page owns a baseline", () => {
    expect(findBaselineConflicts([baseline("p1", "v1")], ["p1"], [])).toBe(true);
  });

  it("reports a conflict when a deleted viewport owns a baseline", () => {
    expect(findBaselineConflicts([baseline("p1", "v1")], [], ["v1"])).toBe(true);
  });

  it("reports no conflict when there are no baselines at all", () => {
    expect(findBaselineConflicts([], ["p1"], ["v1"])).toBe(false);
  });
});
