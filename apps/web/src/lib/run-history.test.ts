import { describe, expect, it } from "vitest";
import type { Run } from "@vrt/db";
import { bucketRunHistory } from "./run-history.js";

type HistoryRun = Pick<Run, "id" | "status" | "createdAt">;

function run(id: string, status: Run["status"], createdAt: Date): HistoryRun {
  return { id, status, createdAt };
}

// Local time on purpose: buckets follow the server's calendar days, so the
// fixtures must too or the tests would flip with the machine's timezone.
function localDate(year: number, month: number, day: number, hour = 12): Date {
  return new Date(year, month - 1, day, hour);
}

const NOW = localDate(2026, 8, 15, 10);

describe("bucketRunHistory", () => {
  it("returns one bucket per day, oldest first, ending today", () => {
    const history = bucketRunHistory([], new Set(), { days: 3, now: NOW });

    expect(history.days.map((day) => day.date)).toEqual([
      new Date(2026, 7, 13),
      new Date(2026, 7, 14),
      new Date(2026, 7, 15),
    ]);
    expect(history.totalPassed).toBe(0);
    expect(history.totalFailed).toBe(0);
  });

  it("names each bucket on the server, so the client never formats the date itself", () => {
    // The client component renders these strings as-is: formatting the
    // instant in the browser would use the viewer's zone and, near midnight,
    // land on a different calendar day than the server bucketed by - a
    // hydration mismatch that React 19 recovers from by re-rendering the
    // root, which drops the theme class from <html>.
    const history = bucketRunHistory([], new Set(), { days: 3, now: NOW });

    expect(history.days.map((day) => day.key)).toEqual(["2026-08-13", "2026-08-14", "2026-08-15"]);
    expect(history.days.map((day) => day.weekdayInitial)).toEqual(["T", "F", "S"]);
    expect(history.days.map((day) => day.label)).toEqual(["Aug 13", "Aug 14", "Aug 15"]);
    expect(history.days.map((day) => day.tooltipLabel)).toEqual([
      "Thu, Aug 13",
      "Fri, Aug 14",
      "Sat, Aug 15",
    ]);
  });

  it("counts a finished run with no failed comparison as passed in its day", () => {
    const history = bucketRunHistory([run("a", "done", localDate(2026, 8, 14))], new Set(), {
      days: 3,
      now: NOW,
    });

    expect(history.days[1]).toMatchObject({
      date: new Date(2026, 7, 14),
      passed: 1,
      failed: 0,
      pending: 0,
    });
    expect(history.totalPassed).toBe(1);
  });

  it("counts a run as failed when any of its comparisons failed", () => {
    const history = bucketRunHistory([run("a", "done", localDate(2026, 8, 15))], new Set(["a"]), {
      days: 3,
      now: NOW,
    });

    expect(history.days[2]).toMatchObject({
      date: new Date(2026, 7, 15),
      passed: 0,
      failed: 1,
      pending: 0,
    });
  });

  it("counts a worker-errored run as failed even with no comparisons", () => {
    const history = bucketRunHistory([run("a", "failed", localDate(2026, 8, 15))], new Set(), {
      days: 3,
      now: NOW,
    });

    expect(history.totalFailed).toBe(1);
  });

  it("counts queued and running runs as pending, never as an outcome", () => {
    const history = bucketRunHistory(
      [run("a", "queued", localDate(2026, 8, 15)), run("b", "running", localDate(2026, 8, 15))],
      new Set(),
      { days: 3, now: NOW },
    );

    expect(history.days[2]!.pending).toBe(2);
    expect(history.totalPending).toBe(2);
    expect(history.totalPassed).toBe(0);
    expect(history.totalFailed).toBe(0);
  });

  it("keeps pending runs out of the pass rate", () => {
    const history = bucketRunHistory(
      [run("a", "done", localDate(2026, 8, 15)), run("b", "running", localDate(2026, 8, 15))],
      new Set(),
      { days: 3, now: NOW },
    );

    expect(history.passRatePercent).toBe(100);
  });

  it("reports the pass rate as a whole percent of the finished runs", () => {
    const history = bucketRunHistory(
      [
        run("a", "done", localDate(2026, 8, 15)),
        run("b", "done", localDate(2026, 8, 15)),
        run("c", "failed", localDate(2026, 8, 14)),
      ],
      new Set(),
      { days: 3, now: NOW },
    );

    expect(history.passRatePercent).toBe(67);
  });

  it("has no pass rate when nothing finished in the window", () => {
    const history = bucketRunHistory([run("a", "queued", localDate(2026, 8, 15))], new Set(), {
      days: 3,
      now: NOW,
    });

    expect(history.passRatePercent).toBeNull();
  });

  it("rates the window immediately before the visible one separately", () => {
    const history = bucketRunHistory(
      [
        // Aug 13-15 is on the chart, Aug 10-12 is the window it compares to.
        run("a", "done", localDate(2026, 8, 15)),
        run("b", "failed", localDate(2026, 8, 11)),
        run("c", "done", localDate(2026, 8, 11)),
        run("d", "done", localDate(2026, 8, 10)),
        run("e", "done", localDate(2026, 8, 10)),
      ],
      new Set(),
      { days: 3, now: NOW },
    );

    expect(history.passRatePercent).toBe(100);
    expect(history.previousPassRatePercent).toBe(75);
    expect(history.totalPassed).toBe(1);
  });

  it("ignores runs older than the comparison window", () => {
    const history = bucketRunHistory([run("old", "failed", localDate(2026, 8, 9, 23))], new Set(), {
      days: 3,
      now: NOW,
    });

    expect(history.previousPassRatePercent).toBeNull();
  });

  it("keeps a run from the comparison window out of the buckets", () => {
    const history = bucketRunHistory([run("old", "done", localDate(2026, 8, 12, 23))], new Set(), {
      days: 3,
      now: NOW,
    });

    expect(history.totalPassed).toBe(0);
    expect(history.previousPassRatePercent).toBe(100);
  });

  it("buckets by calendar day, not by 24-hour offsets from now", () => {
    // 23:00 the previous evening is less than 24h before a 10:00 "now", but
    // still belongs to yesterday's bucket.
    const history = bucketRunHistory([run("a", "done", localDate(2026, 8, 14, 23))], new Set(), {
      days: 3,
      now: NOW,
    });

    expect(history.days[1]!.passed).toBe(1);
    expect(history.days[2]!.passed).toBe(0);
  });

  it("sums totals across all days", () => {
    const history = bucketRunHistory(
      [
        run("a", "done", localDate(2026, 8, 13)),
        run("b", "done", localDate(2026, 8, 14)),
        run("c", "failed", localDate(2026, 8, 14)),
        run("d", "done", localDate(2026, 8, 15)),
      ],
      new Set(["d"]),
      { days: 3, now: NOW },
    );

    expect(history.totalPassed).toBe(2);
    expect(history.totalFailed).toBe(2);
  });
});

describe("bucketRunHistory trend", () => {
  it("is the difference between the two windows in percentage points", () => {
    const history = bucketRunHistory(
      [
        // Aug 13-15 is on the chart: 1 of 2 finished runs passed (50%).
        run("a", "done", localDate(2026, 8, 15)),
        run("b", "failed", localDate(2026, 8, 14)),
        // Aug 10-12 is what it compares to: 3 of 4 passed (75%).
        run("c", "done", localDate(2026, 8, 12)),
        run("d", "done", localDate(2026, 8, 11)),
        run("e", "done", localDate(2026, 8, 11)),
        run("f", "failed", localDate(2026, 8, 10)),
      ],
      new Set(),
      { days: 3, now: NOW },
    );

    expect(history.passRateDeltaPoints).toBe(-25);
  });

  it("has no trend when the comparison window had no finished runs", () => {
    const history = bucketRunHistory([run("a", "done", localDate(2026, 8, 15))], new Set(), {
      days: 3,
      now: NOW,
    });

    expect(history.passRatePercent).toBe(100);
    expect(history.passRateDeltaPoints).toBeNull();
  });
});
