import { describe, expect, it, vi } from "vitest";
import { DeadlineError, withDeadline } from "./deadline.js";

describe("withDeadline", () => {
  it("passes the work's own result through when it finishes in time", async () => {
    await expect(withDeadline(Promise.resolve("shot"), 1_000, "capture")).resolves.toBe("shot");
  });

  it("passes the work's own rejection through, unwrapped", async () => {
    const failure = new Error("net::ERR_NAME_NOT_RESOLVED");
    await expect(withDeadline(Promise.reject(failure), 1_000, "capture")).rejects.toBe(failure);
  });

  it("rejects with a DeadlineError naming the work once the limit passes", async () => {
    vi.useFakeTimers();
    try {
      const guarded = withDeadline(new Promise<never>(() => {}), 5_000, "Capture of / @ Mobile");
      const settled = expect(guarded).rejects.toThrow(DeadlineError);
      await vi.advanceTimersByTimeAsync(5_000);
      await settled;
      await expect(guarded.catch((error: unknown) => (error as Error).message)).resolves.toBe(
        "Capture of / @ Mobile exceeded its 5000ms deadline",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  // The reason this is a function and not two inline lines at each call site:
  // the abandoned work is still running, and a Playwright call abandoned this
  // way usually *does* reject later - when its page is closed. With nothing
  // listening any more that would be an unhandled rejection, which ends the
  // worker process.
  it("swallows a rejection that arrives after the deadline already fired", async () => {
    vi.useFakeTimers();
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      let failLate: (error: Error) => void = () => {};
      const work = new Promise<never>((_, reject) => {
        failLate = reject;
      });
      const guarded = withDeadline(work, 1_000, "capture");
      // Asserted *before* the clock moves: a handler attached after `guarded`
      // has already rejected is itself an unhandled rejection, which would
      // trip the listener below for a reason that has nothing to do with the
      // late failure this test is about.
      const settled = expect(guarded).rejects.toThrow(DeadlineError);
      await vi.advanceTimersByTimeAsync(1_000);
      await settled;

      failLate(new Error("Target page, context or browser has been closed"));
      // Unhandled rejections are reported a macrotask later, so give the loop
      // a real turn before asserting nothing was reported.
      vi.useRealTimers();
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
      vi.useRealTimers();
    }
  });

  it("clears its timer so a finished capture cannot hold the process open", async () => {
    vi.useFakeTimers();
    try {
      await withDeadline(Promise.resolve("shot"), 60_000, "capture");
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
