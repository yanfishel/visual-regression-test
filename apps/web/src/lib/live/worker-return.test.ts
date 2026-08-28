import { describe, expect, it } from "vitest";
import { workerJoined } from "./worker-return.js";

describe("workerJoined", () => {
  it("says nothing on the first state it sees, which the page was rendered with", () => {
    expect(workerJoined(null, 1)).toBe(false);
    expect(workerJoined(null, 0)).toBe(false);
  });

  it("reports a worker that just came back after none were left", () => {
    expect(workerJoined(0, 1)).toBe(true);
  });

  it("reports an extra worker joining - it boots, and booting is what reconciles", () => {
    expect(workerJoined(1, 2)).toBe(true);
  });

  it("stays quiet while the count holds or drops", () => {
    expect(workerJoined(1, 1)).toBe(false);
    expect(workerJoined(0, 0)).toBe(false);
    expect(workerJoined(2, 1)).toBe(false);
    expect(workerJoined(1, 0)).toBe(false);
  });
});
