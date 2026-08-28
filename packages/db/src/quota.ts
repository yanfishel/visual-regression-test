import { and, count, eq, gt, inArray, ne, sql } from "drizzle-orm";
import type { Database } from "./client.js";
import { roleLimits, runs, type RoleLimitsRow, type UserRow } from "./schema.js";

// Thrown out of action and scheduler transactions. The web app renders the
// message verbatim as a form error; the scheduler turns it into a skip.
export class QuotaError extends Error {}

// A project already has work in flight. Not a quota - a project's runs are
// serialised because a second concurrent run of the same project would
// compare against baselines the first one is still moving.
export class ActiveRunError extends Error {}

export const ACTIVE_RUN_MESSAGE = "A run is already in progress.";

// Diagnostic copy, not product copy: nothing in the web UI shows a single
// skip's numbers today (SKIP_REASON_TEXT in schedule-display.ts only keys off
// the coarse reason), so this string's one home is the scheduler's log line
// (apps/worker/src/scheduler.ts) - the only place an operator can see whether
// a limit is actually too tight.
export function automatedRunQuotaMessage(used: number, limit: number): string {
  return `Daily automated run limit reached: ${used} of ${limit} used in the last 24 hours.`;
}

// Admins have no limits row and skip the project and page quotas entirely -
// but not the automated-run one; see automatedRunLimitRoleFor below, which
// holds admins to the live `pro` row instead. A non-admin role missing its
// row (shouldn't happen - the migration seeds both) fails open rather than
// locking the user out.
export async function roleLimitsFor(tx: Database, user: UserRow): Promise<RoleLimitsRow | null> {
  if (user.role === "admin") {
    return null;
  }
  return (await tx.query.roleLimits.findFirst({ where: eq(roleLimits.role, user.role) })) ?? null;
}

// Serializes count-then-insert per user: two concurrent transactions under
// READ COMMITTED would otherwise both pass the same count. Transaction-scoped,
// so the caller MUST be inside db.transaction - the lock releases at commit.
async function lockUserQuota(tx: Database, userId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"vrt-quota:" + userId}))`);
}

// Admins skip the project and page quotas entirely (roleLimitsFor returns
// null for them), but not this one: one worker runs one Chromium at a time,
// so an admin's schedules saturate it exactly as anyone else's would. They
// are held to the `pro` allowance instead - not a different or absent role -
// because the constraint is physical, not commercial. Kept as its own pure
// function, rather than inlined into automatedRunLimitFor, so a later change
// to the rule (a different role, an exception) has exactly one place to
// land: automatedRunLimitFor uses it below, and so does the web lib's
// batched screen-facing lookup (apps/web/src/lib/schedule-quota.ts), which
// cannot call automatedRunLimitFor itself without turning one whole-table
// role_limits read into one query per distinct role.
export function automatedRunLimitRoleFor(role: UserRow["role"]): UserRow["role"] {
  return role === "admin" ? "pro" : role;
}

// Read live rather than copied: raising the pro role's limit in /settings
// raises an admin's automated-run cap with it (see automatedRunLimitRoleFor).
export async function automatedRunLimitFor(tx: Database, user: UserRow): Promise<number | null> {
  const row = await tx.query.roleLimits.findFirst({
    where: eq(roleLimits.role, automatedRunLimitRoleFor(user.role)),
  });
  return row?.maxAutomatedRunsPerDay ?? null;
}

// Exported so packages/db/src/quota.test.ts can render this exact predicate
// with a real (connection-less) drizzle instance's `.toSQL()` and pin it: the
// fake `tx` the tests in this file use ignores `.where()`'s argument
// entirely, so a slipped `manual` exclusion or a wrong comparison operator on
// the 24h bound would otherwise pass every test here silently, and a slip
// here fails OPEN - quotas silently stop applying. Both counting functions
// below share it and add their own project scoping (a single `eq` or a
// batched `inArray`) on top.
export function automatedRunWindowPredicate(since: Date) {
  return and(gt(runs.createdAt, since), ne(runs.trigger, "manual"));
}

// Counted from the runs table by project - the allowance is spent per
// project (CLAUDE.md section 12), so an owner's other projects are none of
// this query's business. Manual runs are excluded by design: quotas measure
// automation, not the Run button. Every automated run counts regardless of
// outcome - a failed one still consumed the worker.
export async function countAutomatedRunsTodayForProject(
  tx: Database,
  projectId: string,
  now: Date = new Date(),
): Promise<number> {
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [row] = await tx
    .select({ value: count() })
    .from(runs)
    .where(and(eq(runs.projectId, projectId), automatedRunWindowPredicate(dayAgo)));
  return row?.value ?? 0;
}

/** One grouped query for a whole screen's worth of projects. */
export async function countAutomatedRunsTodayByProject(
  tx: Database,
  projectIds: readonly string[],
  now: Date = new Date(),
): Promise<Map<string, number>> {
  if (projectIds.length === 0) {
    return new Map();
  }
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const rows = await tx
    .select({ projectId: runs.projectId, value: count() })
    .from(runs)
    .where(and(inArray(runs.projectId, [...projectIds]), automatedRunWindowPredicate(dayAgo)))
    .groupBy(runs.projectId);
  // A project with no automated runs has no row - callers read a missing key
  // as zero, never as undefined.
  return new Map(rows.map((row) => [row.projectId, row.value]));
}

// The limit belongs to the owner's role; the spending belongs to the project.
// The advisory lock is still keyed by owner, which is enough: it serialises
// the count-then-insert for everything that owner owns.
export async function assertProjectAutomatedRunQuota(
  tx: Database,
  projectId: string,
  owner: UserRow,
  now: Date = new Date(),
): Promise<void> {
  const limit = await automatedRunLimitFor(tx, owner);
  if (limit === null) {
    return;
  }
  await lockUserQuota(tx, owner.id);
  const used = await countAutomatedRunsTodayForProject(tx, projectId, now);
  if (used >= limit) {
    throw new QuotaError(automatedRunQuotaMessage(used, limit));
  }
}

// A project may have at most one queued or running run. Enforced here rather
// than by a partial unique index because "one of these two statuses" is not
// expressible as one; both the Run button and the scheduler call it inside
// the transaction that inserts the run.
export async function assertNoActiveRun(tx: Database, projectId: string): Promise<void> {
  const [row] = await tx
    .select({ value: count() })
    .from(runs)
    .where(and(eq(runs.projectId, projectId), inArray(runs.status, ["queued", "running"])));
  if ((row?.value ?? 0) > 0) {
    throw new ActiveRunError(ACTIVE_RUN_MESSAGE);
  }
}
