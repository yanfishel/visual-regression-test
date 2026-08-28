import { count, inArray } from "drizzle-orm";
import { db, projects, users, type UserRow } from "@vrt/db";
import { ALL_OWNERS_VALUE } from "./query-params.js";

export { ALL_OWNERS_VALUE };

export interface ProjectOwner {
  id: string;
  email: string;
  projects: number;
}

/**
 * Who the admin can filter by: everyone who owns at least one project, plus
 * the admin themselves - they are the default selection, so they have to be
 * in the list even before they create anything. Sorted by email, since that
 * is what the reader searches by.
 */
export function toOwnerOptions(
  owners: UserRow[],
  projectCounts: Map<string, number>,
  admin: UserRow,
): ProjectOwner[] {
  const byId = new Map<string, UserRow>(owners.map((owner) => [owner.id, owner]));
  byId.set(admin.id, byId.get(admin.id) ?? admin);
  return [...byId.values()]
    .map((owner) => ({
      id: owner.id,
      email: owner.email,
      projects: projectCounts.get(owner.id) ?? 0,
    }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

/**
 * Missing means "the viewing admin", which is the default: showing every
 * user's projects at once stops being useful once there are many of them.
 * Anything unknown - a deleted user, a hand-typed id - falls back to that
 * same default rather than rendering an empty list under a stale name.
 */
export function parseOwnerFilter(value: unknown, knownIds: string[], adminId: string): string {
  if (value === ALL_OWNERS_VALUE) {
    return ALL_OWNERS_VALUE;
  }
  return typeof value === "string" && knownIds.includes(value) ? value : adminId;
}

/** One grouped query for the counts, one lookup for the owners themselves. */
export async function getProjectOwners(admin: UserRow): Promise<ProjectOwner[]> {
  const counts = await db
    .select({ ownerId: projects.ownerId, projects: count() })
    .from(projects)
    .groupBy(projects.ownerId);
  const ownerIds = counts.map((row) => row.ownerId);
  const owners = ownerIds.length ? await db.query.users.findMany({ where: inArray(users.id, ownerIds) }) : [];
  return toOwnerOptions(owners, new Map(counts.map((row) => [row.ownerId, row.projects])), admin);
}
