import { describe, expect, it } from "vitest";
import { formatUserSummary } from "./user-summary.js";

const JOINED = new Date("2026-08-13T09:00:00Z");
const NOW = new Date("2026-08-15T09:00:00Z");
const LAST_RUN = new Date("2026-08-14T09:00:00Z");

describe("formatUserSummary", () => {
  it("spells out the columns the narrow layout hides", () => {
    expect(
      formatUserSummary(
        { projects: 3, runs30d: 17, lastRunAt: LAST_RUN },
        { projectLimit: 10, joinedAt: JOINED, now: NOW },
      ),
    ).toBe("3 / 10 projects · 17 runs · 1d ago · joined 2026-08-13");
  });

  it("drops the quota for a role without a limit", () => {
    expect(
      formatUserSummary(
        { projects: 3, runs30d: 0, lastRunAt: null },
        { projectLimit: null, joinedAt: JOINED, now: NOW },
      ),
    ).toBe("3 projects · 0 runs · never run · joined 2026-08-13");
  });

  it("says so when the user has never run anything", () => {
    expect(
      formatUserSummary(
        { projects: 0, runs30d: 0, lastRunAt: null },
        { projectLimit: 5, joinedAt: JOINED, now: NOW },
      ),
    ).toContain("never run");
  });

  it("uses the singular for a single project or run", () => {
    expect(
      formatUserSummary(
        { projects: 1, runs30d: 1, lastRunAt: LAST_RUN },
        { projectLimit: null, joinedAt: JOINED, now: NOW },
      ),
    ).toBe("1 project · 1 run · 1d ago · joined 2026-08-13");
  });
});
