import { desc, eq } from "drizzle-orm";
import type { RunStatus, RunTrigger } from "@vrt/shared";
import { projects, runs, type Database, type UserRow } from "@vrt/db";
import { isAdmin } from "./authz.js";

export interface RecentRun {
  id: string;
  projectId: string;
  projectName: string;
  status: RunStatus;
  trigger: RunTrigger;
  /** `runs.error` - feeds the failed pill's tooltip. */
  error: string | null;
  createdAt: Date;
}

/**
 * Whose projects a listing covers: an owner id to filter by, or `undefined`
 * for "everything".
 *
 * `ownerId` is the admin's owner filter (lib/project-owners.ts) - a view
 * control that narrows their otherwise unrestricted list, **not** an
 * authorization check. Everyone else stays pinned to their own projects no
 * matter what the query string says, which is why the non-admin branch never
 * looks at it.
 */
export function resolveOwnerScope(user: UserRow, ownerId?: string): string | undefined {
  return isAdmin(user) ? ownerId : user.id;
}

// One join instead of a per-run project lookup: the sidebar renders on every
// page load.
export async function getRecentRuns(
  database: Database,
  user: UserRow,
  { limit = 5, ownerId }: { limit?: number; ownerId?: string } = {},
): Promise<RecentRun[]> {
  const scope = resolveOwnerScope(user, ownerId);
  return database
    .select({
      id: runs.id,
      projectId: runs.projectId,
      projectName: projects.name,
      status: runs.status,
      trigger: runs.trigger,
      error: runs.error,
      createdAt: runs.createdAt,
    })
    .from(runs)
    .innerJoin(projects, eq(projects.id, runs.projectId))
    .where(scope ? eq(projects.ownerId, scope) : undefined)
    .orderBy(desc(runs.createdAt))
    .limit(limit);
}
