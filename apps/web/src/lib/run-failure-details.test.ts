import { describe, expect, it } from "vitest";
import { describeRunFailure } from "./run-failure-details.js";

describe("describeRunFailure", () => {
  it("names the failed comparisons", () => {
    expect(describeRunFailure({ status: "done", error: null }, 1)).toEqual(["1 comparison failed"]);
    expect(describeRunFailure({ status: "done", error: null }, 4)).toEqual(["4 comparisons failed"]);
  });

  it("names a partial capture from the counts, not from runs.error", () => {
    expect(
      describeRunFailure({ status: "failed", error: "3 of 6 captures failed" }, 0, {
        captured: 3,
        failed: 3,
      }),
    ).toEqual(["3 of 6 captures failed"]);
  });

  it("falls back to runs.error for a worker-level failure", () => {
    expect(describeRunFailure({ status: "failed", error: "Stalled job retried" }, 0)).toEqual([
      "Run failed: Stalled job retried",
    ]);
    expect(describeRunFailure({ status: "failed", error: null }, 0)).toEqual(["Run failed"]);
  });

  it("uses runs.error when no capture counts are at hand (the project card)", () => {
    expect(describeRunFailure({ status: "failed", error: "8 of 12 captures failed" }, 0)).toEqual([
      "Run failed: 8 of 12 captures failed",
    ]);
  });

  it("lists comparisons before captures when both failed", () => {
    expect(
      describeRunFailure({ status: "failed", error: "1 of 6 captures failed" }, 2, {
        captured: 5,
        failed: 1,
      }),
    ).toEqual(["2 comparisons failed", "1 of 6 captures failed"]);
  });

  it("keeps a legacy error blob to one clean, bounded line", () => {
    const ESC = "\u001b";
    const blob =
      "CV @ desktop: page.goto: net::ERR_ABORTED at https://example.com/media/cv.pdf Call log:\n" +
      `${ESC}[2m- navigating to "https://example.com/media/cv.pdf", waiting until "load"${ESC}[22m ; ` +
      "CV @ mobile: page.goto: net::ERR_ABORTED at https://example.com/media/cv.pdf Call log: " +
      `${ESC}[2m- navigating to "https://example.com/media/cv.pdf", waiting until "load"${ESC}[22m`;
    const [line] = describeRunFailure({ status: "failed", error: blob }, 0);
    expect(line).toMatch(/^Run failed: CV @ desktop: page\.goto: net::ERR_ABORTED/);
    expect(line).not.toContain(ESC);
    expect(line).not.toContain("\n");
    expect(line!.endsWith("…")).toBe(true);
    expect(line!.length).toBeLessThanOrEqual("Run failed: ".length + 140);
  });

  it("is empty for a run that did not fail", () => {
    expect(describeRunFailure({ status: "done", error: null }, 0, { captured: 6, failed: 0 })).toEqual([]);
    expect(describeRunFailure({ status: "running", error: null }, 0)).toEqual([]);
  });
});
