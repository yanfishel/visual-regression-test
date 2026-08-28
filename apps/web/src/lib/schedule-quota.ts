import { inArray } from "drizzle-orm";
import {
  automatedRunLimitRoleFor,
  countAutomatedRunsTodayByProject,
  db,
  users,
  type Database,
} from "@vrt/db";

/** What the schedule dialog needs to show a cadence's cost before saving. */
export interface ScheduleQuotaContext {
  /**
   * `null` means the check fails open. Two causes: the role looked up via
   * `automatedRunLimitRoleFor` (the owner's own role, or `pro` for an admin
   * owner) has no `role_limits` row, or - the one case with no role lookup
   * at all - the project's owner didn't resolve from the FK, in which case
   * `used` is also forced to `0` rather than left stale.
   */
  limit: number | null;
  used: number;
}

const NO_LIMIT: ScheduleQuotaContext = { limit: null, used: 0 };

/**
 * The quota context shown in a project's Schedule section is always the
 * PROJECT's, never the viewer's - an admin editing someone else's project
 * must see that project's own spend, not their own.
 *
 * The allowance is spent per project (CLAUDE.md §12), but it is still sized
 * by the owner's role via `automatedRunLimitRoleFor` (`@vrt/db`) - the single
 * place the "admins are capped at the `pro` allowance instead of going
 * unlimited" rule lives, also used by `automatedRunLimitFor`. It isn't
 * called directly here because it takes one role and does its own query;
 * calling it per owner would turn the one whole-table `role_limits` read
 * below into one query per distinct role, breaking the fixed-query-count
 * guarantee this function is held to. Applying just the role mapping to an
 * already-batched map keeps both the rule and the batching intact.
 *
 * Batched over every project passed in: one whole-table `role_limits` read
 * (a two-row table, cheaper to read once and index by role in memory), one
 * lookup for the distinct owners of the given projects, and one grouped
 * `countAutomatedRunsTodayByProject` call - a fixed number of queries
 * regardless of how many projects are on the page, never one per
 * project/card (CLAUDE.md §9).
 */
export async function getScheduleQuotaContexts(
  projects: readonly { id: string; ownerId: string }[],
  database: Database = db,
  now: Date = new Date(),
): Promise<Map<string, ScheduleQuotaContext>> {
  const result = new Map<string, ScheduleQuotaContext>();
  if (projects.length === 0) {
    return result;
  }

  const ownerIds = [...new Set(projects.map((project) => project.ownerId))];
  const [limitRows, owners, usedByProjectId] = await Promise.all([
    database.query.roleLimits.findMany(),
    database.query.users.findMany({ where: inArray(users.id, ownerIds) }),
    countAutomatedRunsTodayByProject(
      database,
      projects.map((project) => project.id),
      now,
    ),
  ]);
  const limitByRole = new Map(limitRows.map((row) => [row.role, row.maxAutomatedRunsPerDay]));
  const ownerById = new Map(owners.map((owner) => [owner.id, owner]));

  for (const project of projects) {
    const owner = ownerById.get(project.ownerId);
    if (!owner) {
      // The owner FK should always resolve; fail open rather than throw on
      // a screen render if it somehow doesn't.
      result.set(project.id, NO_LIMIT);
      continue;
    }
    const limit = limitByRole.get(automatedRunLimitRoleFor(owner.role)) ?? null;
    result.set(project.id, {
      limit,
      used: limit === null ? 0 : (usedByProjectId.get(project.id) ?? 0),
    });
  }
  return result;
}
