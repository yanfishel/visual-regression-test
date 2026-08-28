import { describe, expect, it } from "vitest";
import type { Database, UserRow } from "@vrt/db";
import { getRecentRuns, resolveOwnerScope } from "./recent-runs.js";

const ownerUser: UserRow = {
  id: "33333333-3333-4333-8333-333333333333",
  clerkId: "user_x",
  email: "owner@example.com",
  role: "user",
  createdAt: new Date(0),
};
const adminUser: UserRow = { ...ownerUser, id: "44444444-4444-4444-8444-444444444444", role: "admin" };

// Records the filter passed to .where() so tests can assert whether the
// owner scope was applied (a real filter object) or skipped (undefined, the
// admin case).
function createFakeDb(rows: unknown[]): { db: Database; calls: number; whereArgs: unknown[] } {
  const state = { calls: 0 };
  const whereArgs: unknown[] = [];
  const db = {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: (filter: unknown) => {
            whereArgs.push(filter);
            return {
              orderBy: () => ({
                limit: async () => {
                  state.calls++;
                  return rows;
                },
              }),
            };
          },
        }),
      }),
    }),
  } as unknown as Database;
  return {
    db,
    get calls() {
      return state.calls;
    },
    whereArgs,
  };
}

describe("getRecentRuns", () => {
  it("returns the joined rows as-is, in one query", async () => {
    const row = {
      id: "11111111-1111-4111-8111-111111111111",
      projectId: "22222222-2222-4222-8222-222222222222",
      projectName: "example.com",
      status: "done",
      trigger: "manual",
      createdAt: new Date(0),
    };
    const fake = createFakeDb([row]);

    const runs = await getRecentRuns(fake.db, ownerUser, { limit: 5 });

    expect(runs).toEqual([row]);
    expect(fake.calls).toBe(1);
    expect(fake.whereArgs).toHaveLength(1);
    expect(fake.whereArgs[0]).toBeDefined();
  });

  it("returns an empty list when there are no runs", async () => {
    const fake = createFakeDb([]);
    expect(await getRecentRuns(fake.db, ownerUser)).toEqual([]);
  });

  it("passes no filter for an admin, so the same single query returns every project's rows", async () => {
    const row = {
      id: "11111111-1111-4111-8111-111111111111",
      projectId: "22222222-2222-4222-8222-222222222222",
      projectName: "someone-elses-project",
      status: "done",
      trigger: "manual",
      createdAt: new Date(0),
    };
    const fake = createFakeDb([row]);

    const runs = await getRecentRuns(fake.db, adminUser, { limit: 5 });

    expect(runs).toEqual([row]);
    expect(fake.calls).toBe(1);
    expect(fake.whereArgs).toEqual([undefined]);
  });

  it("applies a filter when the admin picked an owner", async () => {
    const fake = createFakeDb([]);

    await getRecentRuns(fake.db, adminUser, { ownerId: ownerUser.id });

    expect(fake.whereArgs).toHaveLength(1);
    expect(fake.whereArgs[0]).toBeDefined();
  });
});

describe("resolveOwnerScope", () => {
  it("gives an admin whatever owner they picked, and everything without one", () => {
    expect(resolveOwnerScope(adminUser, ownerUser.id)).toBe(ownerUser.id);
    expect(resolveOwnerScope(adminUser, undefined)).toBeUndefined();
  });

  // The filter is a view control, not an authorization check: a non-admin
  // stays pinned to their own projects whatever the query string says.
  it("pins a non-admin to themselves, ignoring the requested owner", () => {
    expect(resolveOwnerScope(ownerUser, adminUser.id)).toBe(ownerUser.id);
    expect(resolveOwnerScope(ownerUser, undefined)).toBe(ownerUser.id);
  });
});
