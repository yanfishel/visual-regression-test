import { describe, expect, it } from "vitest";
import type { Database, UserRow } from "@vrt/db";
import type { ScheduleInput } from "@vrt/shared";
import { assertAffordableCount, scheduleRowFrom, writeProjectSchedule } from "./schedule-write.js";

const nightly: ScheduleInput = {
  runsPerDay: 3,
  window: "night",
  timeZone: "Asia/Jerusalem",
};

describe("scheduleRowFrom", () => {
  it("builds a row with a computed next run", () => {
    const row = scheduleRowFrom("p1", nightly, new Date("2026-08-17T09:00:00+03:00"));
    expect(row.projectId).toBe("p1");
    expect(row.runsPerDay).toBe(3);
    expect(row.window).toBe("night");
    expect(row.nextRunAt).toBeInstanceOf(Date);
  });

  it("rejects a time zone that is not a real IANA zone", () => {
    expect(() => scheduleRowFrom("p1", { ...nightly, timeZone: "Mars/Olympus" }, new Date())).toThrow(
      "Unknown time zone",
    );
  });
});

describe("assertAffordableCount", () => {
  it("allows a count that fits both the window's ceiling and the plan", () => {
    expect(() => assertAffordableCount(3, "night", 5)).not.toThrow();
    expect(() => assertAffordableCount(12, "night", null)).not.toThrow();
  });

  it("refuses a count the window physically can't hold, naming the window", () => {
    expect(() => assertAffordableCount(13, "night", 100)).toThrow(
      "Night fits at most 12 runs a day, one an hour.",
    );
  });

  it("refuses a count the plan doesn't allow, naming the plan - even within the window's ceiling", () => {
    expect(() => assertAffordableCount(5, "night", 2)).toThrow(
      "Your plan allows 2 automated runs a day for this project.",
    );
  });

  it("allows anything the window permits when there is no plan limit", () => {
    expect(() => assertAffordableCount(12, "any", null)).not.toThrow();
  });
});

const proUser: UserRow = {
  id: "11111111-1111-4111-8111-111111111111",
  clerkId: "user_1",
  email: "pro@example.com",
  role: "pro",
  createdAt: new Date(0),
};

// Models just enough of Database for writeProjectSchedule's upsert:
// automatedRunLimitFor's own roleLimits lookup and an
// insert().values().onConflictDoUpdate() whose arguments get captured for
// inspection.
function createFakeTx(maxAutomatedRunsPerDay: number): {
  tx: Database;
  captured: () => { values: Record<string, unknown>; set: Record<string, unknown> } | null;
} {
  let captured: { values: Record<string, unknown>; set: Record<string, unknown> } | null = null;
  const tx = {
    query: {
      roleLimits: {
        findFirst: async () => ({
          role: "pro",
          maxProjects: 10,
          maxPagesPerProject: 20,
          maxAutomatedRunsPerDay,
        }),
      },
    },
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoUpdate: async (config: { set: Record<string, unknown> }) => {
          captured = { values, set: config.set };
        },
      }),
    }),
  } as unknown as Database;
  return { tx, captured: () => captured };
}

describe("writeProjectSchedule", () => {
  it("never touches paused on an update - the dialog owns the cadence, not the pause state", async () => {
    const { tx, captured } = createFakeTx(50);
    await writeProjectSchedule(tx, "p1", nightly, proUser, new Date("2026-08-17T09:00:00+03:00"));
    // A saved project resumes a schedule only through toggleScheduleAction;
    // this pins that the dialog's save path can never do it by omission.
    expect(captured()?.set).not.toHaveProperty("paused");
    // The insert side still starts a brand-new schedule running.
    expect(captured()?.values.paused).toBe(false);
  });

  it("refuses to write a count the resolved limit doesn't allow", async () => {
    const { tx } = createFakeTx(1);
    await expect(writeProjectSchedule(tx, "p1", nightly, proUser, new Date())).rejects.toThrow(
      "Your plan allows 1 automated run a day for this project.",
    );
  });
});
