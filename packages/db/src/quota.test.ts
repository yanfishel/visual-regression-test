import { drizzle } from "drizzle-orm/postgres-js";
import { describe, expect, it } from "vitest";
import * as schema from "./schema.js";
import type { Database, RoleLimitsRow, UserRow } from "./index.js";
import {
  ACTIVE_RUN_MESSAGE,
  ActiveRunError,
  QuotaError,
  assertNoActiveRun,
  assertProjectAutomatedRunQuota,
  automatedRunLimitRoleFor,
  automatedRunQuotaMessage,
  automatedRunWindowPredicate,
  countAutomatedRunsTodayForProject,
} from "./quota.js";

const proUser: UserRow = {
  id: "33333333-3333-4333-8333-333333333333",
  clerkId: "user_x",
  email: "pro@example.com",
  role: "pro",
  createdAt: new Date(0),
};
const adminUser: UserRow = { ...proUser, id: "44444444-4444-4444-8444-444444444444", role: "admin" };
const proLimits: RoleLimitsRow = {
  role: "pro",
  maxProjects: 10,
  maxPagesPerProject: 20,
  maxAutomatedRunsPerDay: 10,
};

// Covers the three query shapes quota.ts uses: a roleLimits lookup, an
// advisory-lock execute, and a count() select with an optional join. Records
// call order so the lock-before-count invariant can be asserted.
function createFakeTx(options: {
  limits: RoleLimitsRow | null;
  countValue: number;
  callOrder?: string[];
}): Database {
  const callOrder = options.callOrder ?? [];
  const countRows = Promise.resolve([{ value: options.countValue }]);
  const from = {
    where: () => {
      callOrder.push("select");
      return countRows;
    },
    innerJoin: () => ({
      where: () => {
        callOrder.push("select");
        return countRows;
      },
    }),
  };
  return {
    query: { roleLimits: { findFirst: async () => options.limits ?? undefined } },
    execute: async () => {
      callOrder.push("execute");
    },
    select: () => ({ from: () => from }),
  } as unknown as Database;
}

describe("automatedRunQuotaMessage", () => {
  it("says which limit was hit and names the numbers", () => {
    expect(automatedRunQuotaMessage(5, 5)).toBe(
      "Daily automated run limit reached: 5 of 5 used in the last 24 hours.",
    );
  });
});

describe("automatedRunLimitRoleFor", () => {
  it("maps an admin to the pro role", () => {
    expect(automatedRunLimitRoleFor("admin")).toBe("pro");
  });

  it("leaves every other role unchanged", () => {
    expect(automatedRunLimitRoleFor("pro")).toBe("pro");
    expect(automatedRunLimitRoleFor("user")).toBe("user");
  });
});

// The fake tx above (createFakeTx) ignores everything passed to `.where()`,
// so it can't catch a slip in the predicate itself - e.g. the `manual`
// exclusion getting dropped or inverted, which would fail OPEN (quotas
// silently stop applying) rather than loudly. `.toSQL()` renders a built
// query to `{ sql, params }` without needing a live connection (a
// connection-less `drizzle()` instance is enough), so the actual predicate
// the counting queries build can be pinned directly.
describe("automatedRunWindowPredicate", () => {
  const rendered = drizzle({} as never, { schema })
    .select()
    .from(schema.runs)
    .where(automatedRunWindowPredicate(new Date("2026-08-16T09:00:00Z")))
    .toSQL();

  it("excludes manual-triggered runs", () => {
    expect(rendered.sql).toContain('"trigger" <>');
    expect(rendered.params).toContain("manual");
  });

  it("bounds by the created_at window it was given", () => {
    expect(rendered.sql).toContain('"created_at" >');
    expect(rendered.params).toContainEqual("2026-08-16T09:00:00.000Z");
  });
});

describe("countAutomatedRunsTodayForProject", () => {
  it("returns the counted value", async () => {
    const tx = createFakeTx({ limits: proLimits, countValue: 4 });
    await expect(countAutomatedRunsTodayForProject(tx, "p1")).resolves.toBe(4);
  });
});

describe("assertProjectAutomatedRunQuota", () => {
  it("passes under the limit", async () => {
    const tx = createFakeTx({ limits: proLimits, countValue: 9 });
    await expect(assertProjectAutomatedRunQuota(tx, "p1", proUser)).resolves.toBeUndefined();
  });

  it("throws at the limit, naming the project's allowance", async () => {
    const tx = createFakeTx({ limits: proLimits, countValue: 10 });
    await expect(assertProjectAutomatedRunQuota(tx, "p1", proUser)).rejects.toThrow(
      "Daily automated run limit reached: 10 of 10 used in the last 24 hours.",
    );
  });

  it("caps an admin at the pro allowance instead of skipping them", async () => {
    // The fake returns the pro row for the pro-role lookup; an admin at 10
    // used must be refused exactly as a pro would be.
    const under = createFakeTx({ limits: proLimits, countValue: 9 });
    await expect(assertProjectAutomatedRunQuota(under, "p1", adminUser)).resolves.toBeUndefined();
    const at = createFakeTx({ limits: proLimits, countValue: 10 });
    await expect(assertProjectAutomatedRunQuota(at, "p1", adminUser)).rejects.toBeInstanceOf(QuotaError);
  });

  it("still fails open when the pro row is missing", async () => {
    const tx = createFakeTx({ limits: null, countValue: 999 });
    await expect(assertProjectAutomatedRunQuota(tx, "p1", adminUser)).resolves.toBeUndefined();
  });

  it("takes the advisory lock before counting", async () => {
    const callOrder: string[] = [];
    const tx = createFakeTx({ limits: proLimits, countValue: 1, callOrder });
    await assertProjectAutomatedRunQuota(tx, "p1", proUser);
    expect(callOrder.indexOf("execute")).toBeLessThan(callOrder.indexOf("select"));
  });
});

describe("assertNoActiveRun", () => {
  it("passes when nothing is queued or running", async () => {
    const tx = createFakeTx({ limits: null, countValue: 0 });
    await expect(assertNoActiveRun(tx, "p1")).resolves.toBeUndefined();
  });

  it("throws ActiveRunError when a run is already in flight", async () => {
    const tx = createFakeTx({ limits: null, countValue: 1 });
    await expect(assertNoActiveRun(tx, "p1")).rejects.toBeInstanceOf(ActiveRunError);
    await expect(assertNoActiveRun(createFakeTx({ limits: null, countValue: 1 }), "p1")).rejects.toThrow(
      ACTIVE_RUN_MESSAGE,
    );
  });
});
