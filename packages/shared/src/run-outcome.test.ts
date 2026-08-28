import { describe, expect, it } from "vitest";
import { runOutcome } from "./run-outcome.js";

describe("runOutcome", () => {
  it("keeps an in-flight run in flight whatever its comparisons say so far", () => {
    expect(runOutcome("queued", false)).toBe("queued");
    expect(runOutcome("running", false)).toBe("running");
    expect(runOutcome("running", true)).toBe("running");
  });

  it("is failed when the worker failed, regardless of comparisons", () => {
    expect(runOutcome("failed", false)).toBe("failed");
    expect(runOutcome("failed", true)).toBe("failed");
  });

  it("is failed when a finished run caught a visual regression", () => {
    expect(runOutcome("done", true)).toBe("failed");
  });

  it("is passed only when the worker got through and nothing failed", () => {
    expect(runOutcome("done", false)).toBe("passed");
  });
});
