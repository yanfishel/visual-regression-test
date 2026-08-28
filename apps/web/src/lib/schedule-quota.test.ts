import { describe, expect, it } from "vitest";
import type { Database, RoleLimitsRow, UserRow } from "@vrt/db";
import { getScheduleQuotaContexts } from "./schedule-quota.js";

function user(id: string, role: UserRow["role"]): UserRow {
  return { id, clerkId: null, email: `${id}@example.com`, role, createdAt: new Date(0) } as UserRow;
}

// countAutomatedRunsTodayByProject runs its own select/from/where/groupBy
// chain (no join - it queries `runs` directly by project id), not db.query -
// stub that shape directly.
function createFakeDb(fixtures: {
  limits: RoleLimitsRow[];
  owners: UserRow[];
  usedByProjectId: Map<string, number>;
}) {
  const calls = { roleLimits: 0, users: 0, countByProject: 0 };
  const fakeDb = {
    query: {
      roleLimits: {
        findMany: async () => {
          calls.roleLimits++;
          return fixtures.limits;
        },
      },
      users: {
        findMany: async () => {
          calls.users++;
          return fixtures.owners;
        },
      },
    },
    select: () => ({
      from: () => ({
        where: () => ({
          groupBy: async () => {
            calls.countByProject++;
            return [...fixtures.usedByProjectId.entries()].map(([projectId, value]) => ({
              projectId,
              value,
            }));
          },
        }),
      }),
    }),
  } as unknown as Database;

  return { fakeDb, calls };
}

const proLimits: RoleLimitsRow = {
  role: "pro",
  maxProjects: 10,
  maxPagesPerProject: 20,
  maxAutomatedRunsPerDay: 5,
};
const userLimits: RoleLimitsRow = {
  role: "user",
  maxProjects: 3,
  maxPagesPerProject: 5,
  maxAutomatedRunsPerDay: 2,
};

describe("getScheduleQuotaContexts", () => {
  it("caps an admin owner's project at the live pro allowance instead of skipping it", async () => {
    const admin = user("admin-1", "admin");
    const { fakeDb } = createFakeDb({
      limits: [proLimits, userLimits],
      owners: [admin],
      usedByProjectId: new Map([["p1", 3]]),
    });
    const result = await getScheduleQuotaContexts([{ id: "p1", ownerId: admin.id }], fakeDb);
    expect(result.get("p1")).toEqual({ limit: 5, used: 3 });
  });

  it("gives each non-admin owner's project their own role's limit and usage", async () => {
    const proOwner = user("pro-owner", "pro");
    const userOwner = user("user-owner", "user");
    const { fakeDb } = createFakeDb({
      limits: [proLimits, userLimits],
      owners: [proOwner, userOwner],
      usedByProjectId: new Map([
        ["p-pro", 3],
        ["p-user", 1],
      ]),
    });
    const result = await getScheduleQuotaContexts(
      [
        { id: "p-pro", ownerId: proOwner.id },
        { id: "p-user", ownerId: userOwner.id },
      ],
      fakeDb,
    );
    expect(result.get("p-pro")).toEqual({ limit: 5, used: 3 });
    expect(result.get("p-user")).toEqual({ limit: 2, used: 1 });
  });

  it("does not let one owner's plan leak into another owner's project", async () => {
    // The bug this pins: an admin owner's (pro-capped, or null when the pro
    // row is missing) context must never be applied to another owner's
    // project row.
    const admin = user("admin-owner", "admin");
    const userOwner = user("user-owner", "user");
    const { fakeDb } = createFakeDb({
      limits: [userLimits], // no pro row - the admin's own project fails open
      owners: [admin, userOwner],
      usedByProjectId: new Map([
        ["p-admin", 999],
        ["p-user", 2],
      ]),
    });
    const result = await getScheduleQuotaContexts(
      [
        { id: "p-admin", ownerId: admin.id },
        { id: "p-user", ownerId: userOwner.id },
      ],
      fakeDb,
    );
    expect(result.get("p-admin")).toEqual({ limit: null, used: 0 });
    expect(result.get("p-user")).toEqual({ limit: 2, used: 2 });
  });

  it("reports two projects owned by the same user independently", async () => {
    const proOwner = user("pro-owner", "pro");
    const { fakeDb } = createFakeDb({
      limits: [proLimits],
      owners: [proOwner],
      usedByProjectId: new Map([
        ["p-a", 4],
        ["p-b", 0],
      ]),
    });
    const result = await getScheduleQuotaContexts(
      [
        { id: "p-a", ownerId: proOwner.id },
        { id: "p-b", ownerId: proOwner.id },
      ],
      fakeDb,
    );
    expect(result.get("p-a")).toEqual({ limit: 5, used: 4 });
    expect(result.get("p-b")).toEqual({ limit: 5, used: 0 });
  });

  it("defaults usage to 0 for a project with no automated runs in the window", async () => {
    const proOwner = user("pro-owner", "pro");
    const { fakeDb } = createFakeDb({ limits: [proLimits], owners: [proOwner], usedByProjectId: new Map() });
    const result = await getScheduleQuotaContexts([{ id: "p1", ownerId: proOwner.id }], fakeDb);
    expect(result.get("p1")).toEqual({ limit: 5, used: 0 });
  });

  it("fails open for a non-admin role missing its limits row", async () => {
    const proOwner = user("pro-owner", "pro");
    const { fakeDb } = createFakeDb({ limits: [], owners: [proOwner], usedByProjectId: new Map() });
    const result = await getScheduleQuotaContexts([{ id: "p1", ownerId: proOwner.id }], fakeDb);
    expect(result.get("p1")).toEqual({ limit: null, used: 0 });
  });

  it("fails open for an admin's project when the pro row is missing, same as the non-admin path", async () => {
    const admin = user("admin-1", "admin");
    const { fakeDb } = createFakeDb({
      limits: [userLimits],
      owners: [admin],
      usedByProjectId: new Map([["p1", 999]]),
    });
    const result = await getScheduleQuotaContexts([{ id: "p1", ownerId: admin.id }], fakeDb);
    expect(result.get("p1")).toEqual({ limit: null, used: 0 });
  });

  it("issues a fixed number of queries and returns an empty map for no projects", async () => {
    const proOwner = user("pro-owner", "pro");
    const { fakeDb, calls } = createFakeDb({
      limits: [proLimits],
      owners: [proOwner],
      usedByProjectId: new Map([["p-a", 1]]),
    });
    const result = await getScheduleQuotaContexts(
      [
        { id: "p-a", ownerId: proOwner.id },
        { id: "p-b", ownerId: proOwner.id },
      ],
      fakeDb,
    );
    expect(result.size).toBe(2);
    expect(calls.roleLimits).toBe(1);
    expect(calls.users).toBe(1);
    expect(calls.countByProject).toBe(1);

    const empty = await getScheduleQuotaContexts([], fakeDb);
    expect(empty.size).toBe(0);
  });
});
