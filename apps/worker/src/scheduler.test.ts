import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ProjectSchedule } from "@vrt/db";
import { ActiveRunError, QuotaError } from "@vrt/db";

// Referenced from the vi.mock factory below - the "mock" name prefix is what
// exempts it from vitest's hoisting safety check (vi.mock itself is hoisted
// above this file's imports).
const mockDbTransaction = vi.fn();

vi.mock("@vrt/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@vrt/db")>();
  return { ...actual, db: { transaction: (...args: unknown[]) => mockDbTransaction(...args) } };
});

const { decideSchedule, runOneSchedule, runScheduleTick, FALLBACK_RETRY_MS } = await import("./scheduler.js");

const schedule: ProjectSchedule = {
  projectId: "11111111-1111-4111-8111-111111111111",
  runsPerDay: 1,
  window: "night",
  timeZone: "Asia/Jerusalem",
  paused: false,
  nextRunAt: new Date("2026-08-17T00:00:00Z"),
  lastRunAt: null,
  lastSkippedAt: null,
  lastSkipReason: null,
  createdAt: new Date(0),
};

// The scheduler talks to the DB through four calls only: two guards it
// imports, a project+owner lookup, a page/viewport count, and the run insert.
// Faking those keeps the decision logic testable without a database.
function createFakeTx(options: {
  owner?: { id: string; role: "admin" | "pro" | "user" } | null;
  pageCount?: number;
  viewportCount?: number;
  guard?: () => never;
  insertedRunId?: string;
}) {
  const owner = options.owner === undefined ? { id: "u1", role: "pro" as const } : options.owner;
  return {
    query: {
      projects: {
        findFirst: async () =>
          owner
            ? { id: schedule.projectId, ownerId: owner.id, owner: { id: owner.id, role: owner.role } }
            : undefined,
      },
      pages: { findMany: async () => Array.from({ length: options.pageCount ?? 1 }, (_, i) => ({ id: i })) },
      viewports: {
        findMany: async () => Array.from({ length: options.viewportCount ?? 1 }, (_, i) => ({ id: i })),
      },
    },
    insert: () => ({
      values: () => ({
        returning: async () => [{ id: options.insertedRunId ?? "run-1" }],
      }),
    }),
  } as never;
}

describe("decideSchedule", () => {
  it("creates a run when nothing is in the way", async () => {
    const guards = { assertNoActiveRun: vi.fn(), assertProjectAutomatedRunQuota: vi.fn() };
    const decision = await decideSchedule(createFakeTx({}), schedule, new Date(), guards);
    expect(decision).toEqual({ runId: "run-1", skipReason: null });
  });

  it("skips when a run of the same project is already in flight", async () => {
    const guards = {
      assertNoActiveRun: vi.fn(() => {
        throw new ActiveRunError("busy");
      }),
      assertProjectAutomatedRunQuota: vi.fn(),
    };
    const decision = await decideSchedule(createFakeTx({}), schedule, new Date(), guards);
    expect(decision).toEqual({ runId: null, skipReason: "run-in-progress" });
  });

  it("skips a project with no pages", async () => {
    const guards = { assertNoActiveRun: vi.fn(), assertProjectAutomatedRunQuota: vi.fn() };
    const decision = await decideSchedule(createFakeTx({ pageCount: 0 }), schedule, new Date(), guards);
    expect(decision).toEqual({ runId: null, skipReason: "no-pages" });
  });

  it("skips a project with no viewports", async () => {
    const guards = { assertNoActiveRun: vi.fn(), assertProjectAutomatedRunQuota: vi.fn() };
    const decision = await decideSchedule(createFakeTx({ viewportCount: 0 }), schedule, new Date(), guards);
    expect(decision).toEqual({ runId: null, skipReason: "no-pages" });
  });

  it("skips when the owner is out of automated-run quota, carrying the guard's own message", async () => {
    const guards = {
      assertNoActiveRun: vi.fn(),
      assertProjectAutomatedRunQuota: vi.fn(() => {
        throw new QuotaError("no budget");
      }),
    };
    const decision = await decideSchedule(createFakeTx({}), schedule, new Date(), guards);
    expect(decision).toEqual({ runId: null, skipReason: "quota-exceeded", skipDetail: "no budget" });
  });

  it("skips a schedule whose project has vanished", async () => {
    const guards = { assertNoActiveRun: vi.fn(), assertProjectAutomatedRunQuota: vi.fn() };
    const decision = await decideSchedule(createFakeTx({ owner: null }), schedule, new Date(), guards);
    expect(decision).toEqual({ runId: null, skipReason: "no-pages" });
  });

  it("checks the cheap guards before the locking one", async () => {
    const order: string[] = [];
    const guards = {
      assertNoActiveRun: vi.fn(() => {
        order.push("active");
      }),
      assertProjectAutomatedRunQuota: vi.fn(() => {
        order.push("quota");
      }),
    };
    await decideSchedule(createFakeTx({}), schedule, new Date(), guards);
    expect(order).toEqual(["active", "quota"]);
  });
});

// A minimal fake covering what runOneSchedule/runScheduleTick need beyond
// decideSchedule's four calls: the update that records the outcome, and the
// savepoint transaction that isolates one row from the next. `owner: null`
// (the default) is deliberate: every test below cares about what happens
// *after* decideSchedule returns, not about its own branching, which
// `decideSchedule`'s own suite above already covers - so every row here
// takes the cheapest possible path through it (the vanished-project /
// no-pages return, before any guard or insert).
function createFakeScheduleTx(dueRows: ProjectSchedule[] = []) {
  const updateCalls: Record<string, unknown>[] = [];
  const fake = {
    query: {
      projects: { findFirst: async () => undefined },
      pages: { findMany: async () => [] },
      viewports: { findMany: async () => [] },
    },
    insert: () => ({ values: () => ({ returning: async () => [] }) }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          updateCalls.push(values);
        },
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () => ({
              for: async () => dueRows,
            }),
          }),
        }),
      }),
    }),
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(fake),
  };
  return { tx: fake as never, updateCalls };
}

// runsPerDay is invalid for every window's ceiling (max 24 for "any"), so
// computeNextRunAt - the normal way to pick the next instant - is exactly
// what throws, exercising the poisoned-row fallback below.
const invalidSchedule: ProjectSchedule = {
  ...schedule,
  projectId: "22222222-2222-4222-8222-222222222222",
  runsPerDay: 999,
};

describe("runOneSchedule", () => {
  it("falls back to a fixed re-check interval when the row itself is what's broken", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { tx, updateCalls } = createFakeScheduleTx();
    const now = new Date("2026-08-17T00:00:00Z");

    const decision = await runOneSchedule(tx, invalidSchedule, now);

    // Not one of the three real reasons - none fits "the tick itself
    // errored" - and no run was created, so both stay null; the fallback
    // interval is what actually stops this row from being claimed first on
    // every following tick, which is the whole point of the fix.
    expect(decision).toEqual({
      projectId: invalidSchedule.projectId,
      runId: null,
      skipReason: null,
      nextRunAt: new Date(now.getTime() + FALLBACK_RETRY_MS),
    });
    expect(updateCalls).toEqual([
      { nextRunAt: new Date(now.getTime() + FALLBACK_RETRY_MS), lastSkippedAt: now, lastSkipReason: null },
    ]);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining(invalidSchedule.projectId),
      expect.anything(),
    );
    errorSpy.mockRestore();
  });
});

describe("runScheduleTick", () => {
  beforeEach(() => {
    mockDbTransaction.mockReset();
  });

  it("still processes the rest of the batch after one row throws, and advances that row too", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    const healthySchedule: ProjectSchedule = {
      ...schedule,
      projectId: "33333333-3333-4333-8333-333333333333",
    };
    const now = new Date("2026-08-17T00:00:00Z");
    const { tx, updateCalls } = createFakeScheduleTx([invalidSchedule, healthySchedule]);
    mockDbTransaction.mockImplementation((cb: (tx: unknown) => Promise<unknown>) => cb(tx));

    const decisions = await runScheduleTick(now);

    expect(decisions).toEqual([
      {
        projectId: invalidSchedule.projectId,
        runId: null,
        skipReason: null,
        nextRunAt: new Date(now.getTime() + FALLBACK_RETRY_MS),
      },
      {
        projectId: healthySchedule.projectId,
        runId: null,
        skipReason: "no-pages",
        nextRunAt: expect.any(Date),
      },
    ]);
    // Both rows reached their update - the second was never blocked by the
    // first's failure, and both moved next_run_at forward.
    expect(updateCalls).toHaveLength(2);
    vi.restoreAllMocks();
  });
});
