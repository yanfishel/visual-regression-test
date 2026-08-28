import { count, eq, sql } from "drizzle-orm";
import { projects, roleLimitsFor, QuotaError, type Database, type UserRow } from "@vrt/db";

// Re-exported so existing importers (the project and page actions) keep one
// import site; the class itself now lives in @vrt/db because the worker's
// scheduler needs it too.
export { QuotaError };

export function quotaMessage(kind: "projects" | "pages", used: number, limit: number): string {
  switch (kind) {
    case "projects":
      return `Project limit reached: ${used} of ${limit} used.`;
    case "pages":
      return `Page limit exceeded: ${used} pages, at most ${limit} allowed.`;
  }
}

// Serializes count-then-insert per user: two concurrent requests under READ
// COMMITTED would otherwise both pass the same count. Transaction-scoped, so
// the caller MUST be inside db.transaction - the lock releases at commit.
async function lockUserQuota(tx: Database, userId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"vrt-quota:" + userId}))`);
}

export async function assertProjectQuota(tx: Database, user: UserRow): Promise<void> {
  const limits = await roleLimitsFor(tx, user);
  if (!limits) {
    return;
  }
  await lockUserQuota(tx, user.id);
  const [row] = await tx.select({ value: count() }).from(projects).where(eq(projects.ownerId, user.id));
  const used = row?.value ?? 0;
  if (used >= limits.maxProjects) {
    throw new QuotaError(quotaMessage("projects", used, limits.maxProjects));
  }
}

// Bounded by the submitted payload alone, so no lock is needed.
export async function assertPageQuota(tx: Database, user: UserRow, pageCount: number): Promise<void> {
  const limits = await roleLimitsFor(tx, user);
  if (!limits || pageCount <= limits.maxPagesPerProject) {
    return;
  }
  throw new QuotaError(quotaMessage("pages", pageCount, limits.maxPagesPerProject));
}
