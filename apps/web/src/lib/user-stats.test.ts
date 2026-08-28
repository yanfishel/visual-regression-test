import { describe, expect, it } from "vitest";
import { toUserStats } from "./user-stats.js";

describe("toUserStats", () => {
  const ids = ["u1", "u2", "u3"];
  const lastRun = new Date("2026-08-15T10:00:00Z");

  it("joins the two aggregates onto every requested user", () => {
    const stats = toUserStats(
      ids,
      [
        { userId: "u1", projects: 3 },
        { userId: "u2", projects: 1 },
      ],
      [{ userId: "u1", runs30d: 12, lastRunAt: lastRun }],
    );
    expect(stats.get("u1")).toEqual({ projects: 3, runs30d: 12, lastRunAt: lastRun });
    expect(stats.get("u2")).toEqual({ projects: 1, runs30d: 0, lastRunAt: null });
  });

  it("gives a user with no projects and no runs a zeroed row, not undefined", () => {
    const stats = toUserStats(ids, [], []);
    expect(stats.get("u3")).toEqual({ projects: 0, runs30d: 0, lastRunAt: null });
    expect(stats.size).toBe(3);
  });

  it("ignores aggregate rows for users that were not asked for", () => {
    const stats = toUserStats(["u1"], [{ userId: "ghost", projects: 9 }], []);
    expect(stats.size).toBe(1);
    expect(stats.get("u1")?.projects).toBe(0);
  });
});
