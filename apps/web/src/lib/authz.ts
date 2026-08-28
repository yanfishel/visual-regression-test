import { and, eq } from "drizzle-orm";
import {
  comparisons,
  projects,
  runs,
  shots,
  users,
  type Database,
  type Project,
  type UserRow,
} from "@vrt/db";

export function isAdmin(user: UserRow): boolean {
  return user.role === "admin";
}

// The one scoped project lookup every page and action goes through: admins
// see every project, everyone else only their own. Someone else's project
// resolves to null so callers can notFound() without confirming it exists.
export async function findProjectForUser(
  database: Database,
  projectId: string,
  user: UserRow,
): Promise<Project | null> {
  const where = isAdmin(user)
    ? eq(projects.id, projectId)
    : and(eq(projects.id, projectId), eq(projects.ownerId, user.id));
  return (await database.query.projects.findFirst({ where })) ?? null;
}

// The row whose role limit actually governs a project's schedule - never the
// viewer's. findProjectForUser lets an admin load any project, so an admin
// editing a `user`-owned project must be checked against that owner's
// allowance, not their own `pro` one, or a cadence above the owner's plan can
// be saved and simply skip `quota-exceeded` every night instead of being
// refused at save time. Mirrors how getScheduleQuotaContexts (schedule-quota.ts)
// and the scheduler's decideSchedule (apps/worker/src/scheduler.ts, via the
// project's `owner` relation) already resolve it - a limit worked out three
// different ways would be exactly the split-brain this codebase fixed once
// already (see automatedRunLimitFor's comment in packages/db/src/quota.ts).
// Skips the extra query in the common case (a non-admin viewer editing their
// own project, where `findProjectForUser` already guarantees ownerId matches).
export async function resolveProjectOwner(
  database: Database,
  project: Project,
  viewer: UserRow,
): Promise<UserRow> {
  if (project.ownerId === viewer.id) {
    return viewer;
  }
  const owner = await database.query.users.findFirst({ where: eq(users.id, project.ownerId) });
  if (!owner) {
    throw new Error("Project owner not found");
  }
  return owner;
}

// Storage keys are content hashes shared across projects, so access means
// "some shot the user owns references these bytes" - resolved through
// shot -> run -> project.
export async function canAccessStorageKey(
  database: Database,
  user: UserRow,
  storageKey: string,
): Promise<boolean> {
  if (isAdmin(user)) {
    return true;
  }
  const rows = await database
    .select({ id: shots.id })
    .from(shots)
    .innerJoin(runs, eq(shots.runId, runs.id))
    .innerJoin(projects, eq(projects.id, runs.projectId))
    .where(and(eq(shots.storageKey, storageKey), eq(projects.ownerId, user.id)))
    .limit(1);
  return rows.length > 0;
}

// Favicon keys are content hashes too (two projects tracking the same site
// share one), so access means "some project the user owns has this favicon".
export async function canAccessFaviconKey(
  database: Database,
  user: UserRow,
  faviconKey: string,
): Promise<boolean> {
  if (isAdmin(user)) {
    return true;
  }
  const rows = await database
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.faviconKey, faviconKey), eq(projects.ownerId, user.id)))
    .limit(1);
  return rows.length > 0;
}

export async function canAccessComparison(
  database: Database,
  user: UserRow,
  comparisonId: string,
): Promise<boolean> {
  if (isAdmin(user)) {
    return true;
  }
  const rows = await database
    .select({ id: comparisons.id })
    .from(comparisons)
    .innerJoin(shots, eq(comparisons.shotId, shots.id))
    .innerJoin(runs, eq(shots.runId, runs.id))
    .innerJoin(projects, eq(projects.id, runs.projectId))
    .where(and(eq(comparisons.id, comparisonId), eq(projects.ownerId, user.id)))
    .limit(1);
  return rows.length > 0;
}
