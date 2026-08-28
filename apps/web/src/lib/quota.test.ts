import { describe, expect, it } from "vitest";
import type { Database, RoleLimitsRow, UserRow } from "@vrt/db";
import { QuotaError, assertPageQuota, assertProjectQuota, quotaMessage } from "./quota.js";

const proUser: UserRow = {
  id: "33333333-3333-4333-8333-333333333333",
  clerkId: "user_x",
  email: "pro@example.com",
  role: "pro",
  createdAt: new Date(0),
};
const userUser: UserRow = {
  id: "55555555-5555-5555-8555-555555555555",
  clerkId: "user_y",
  email: "user@example.com",
  role: "user",
  createdAt: new Date(0),
};
const adminUser: UserRow = { ...proUser, id: "44444444-4444-4444-8444-444444444444", role: "admin" };
const proLimits: RoleLimitsRow = {
  role: "pro",
  maxProjects: 10,
  maxPagesPerProject: 20,
  maxAutomatedRunsPerDay: 50,
};
const userLimits: RoleLimitsRow = {
  role: "user",
  maxProjects: 2,
  maxPagesPerProject: 5,
  maxAutomatedRunsPerDay: 10,
};

// Covers the query shapes quota.ts uses: roleLimits lookup, advisory-lock
// execute, and a count() select with optional joins. Records call order to
// verify execute (lock) is called before select (count).
function createFakeTx(options: {
  limits: RoleLimitsRow | null;
  countValue: number;
  callOrder?: string[];
}): Database {
  const callOrder = options.callOrder ?? [];
  const whereResult = Promise.resolve([{ value: options.countValue }]);
  const fromResult = {
    where: () => {
      callOrder.push("select");
      return whereResult;
    },
    innerJoin: () => ({
      where: () => {
        callOrder.push("select");
        return whereResult;
      },
    }),
  };
  return {
    query: { roleLimits: { findFirst: async () => options.limits ?? undefined } },
    execute: async () => {
      callOrder.push("execute");
    },
    select: () => ({ from: () => fromResult }),
  } as unknown as Database;
}

describe("quotaMessage", () => {
  it("names the quota and the numbers", () => {
    expect(quotaMessage("projects", 2, 2)).toBe("Project limit reached: 2 of 2 used.");
    expect(quotaMessage("pages", 6, 5)).toBe("Page limit exceeded: 6 pages, at most 5 allowed.");
  });
});

describe("assertProjectQuota", () => {
  it("passes under the limit", async () => {
    const tx = createFakeTx({ limits: proLimits, countValue: 9 });
    await expect(assertProjectQuota(tx, proUser)).resolves.toBeUndefined();
  });

  it("throws QuotaError at the limit", async () => {
    const tx = createFakeTx({ limits: proLimits, countValue: 10 });
    await expect(assertProjectQuota(tx, proUser)).rejects.toBeInstanceOf(QuotaError);
  });

  it("skips admins without reading limits", async () => {
    const tx = createFakeTx({ limits: null, countValue: 999 });
    await expect(assertProjectQuota(tx, adminUser)).resolves.toBeUndefined();
  });

  it("passes when the role has no limits row", async () => {
    const tx = createFakeTx({ limits: null, countValue: 999 });
    await expect(assertProjectQuota(tx, proUser)).resolves.toBeUndefined();
  });

  it("calls advisory lock (execute) before counting (select)", async () => {
    const callOrder: string[] = [];
    const tx = createFakeTx({ limits: proLimits, countValue: 1, callOrder });
    await assertProjectQuota(tx, proUser);
    expect(callOrder.indexOf("execute")).toBeLessThan(callOrder.indexOf("select"));
  });
});

describe("assertPageQuota", () => {
  it("passes at the limit and throws above it", async () => {
    await expect(
      assertPageQuota(createFakeTx({ limits: proLimits, countValue: 0 }), proUser, 20),
    ).resolves.toBeUndefined();
    await expect(
      assertPageQuota(createFakeTx({ limits: proLimits, countValue: 0 }), proUser, 21),
    ).rejects.toBeInstanceOf(QuotaError);
  });
});

describe("user-role limits", () => {
  it("enforces user-role project limits", async () => {
    const tx = createFakeTx({ limits: userLimits, countValue: 2 });
    await expect(assertProjectQuota(tx, userUser)).rejects.toBeInstanceOf(QuotaError);
  });
});
