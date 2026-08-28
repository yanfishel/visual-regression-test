import { describe, expect, it } from "vitest";
import { findOrphanedRunIds } from "./reconcile.js";

const run = (id: string, ageMs: number) => ({
  id,
  createdAt: new Date(Date.now() - ageMs),
});

const MINUTE = 60_000;

describe("findOrphanedRunIds", () => {
  it("flags an old queued/running run with no queue job behind it", () => {
    expect(findOrphanedRunIds([run("r1", 5 * MINUTE)], new Set())).toEqual(["r1"]);
  });

  it("keeps a run whose job is still in the queue", () => {
    expect(findOrphanedRunIds([run("r1", 5 * MINUTE)], new Set(["r1"]))).toEqual([]);
  });

  it("keeps a recent run - it may be mid-enqueue between the DB insert and queue add", () => {
    expect(findOrphanedRunIds([run("r1", 5_000)], new Set())).toEqual([]);
  });
});
