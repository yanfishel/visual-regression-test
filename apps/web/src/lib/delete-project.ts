import { eq } from "drizzle-orm";
import { projects, type Database, type Project, type UserRow } from "@vrt/db";
import { findProjectForUser } from "./authz.js";

// Deleting a project rides the schema's cascades: pages, viewports, runs,
// shots, baselines and comparisons all go with it. The screenshot files stay
// content-addressed on disk until the worker's retention sweep sees their
// hashes are no longer referenced by any shots row; the favicon file has no
// sweep, so the caller releases it (favicon-release.ts) once this returns.
// Returns the deleted project, or null when the scoped lookup found nothing.
export async function deleteProjectOwnedBy(
  database: Database,
  projectId: string,
  user: UserRow,
): Promise<Project | null> {
  const project = await findProjectForUser(database, projectId, user);
  if (!project) {
    return null;
  }
  await database.delete(projects).where(eq(projects.id, projectId));
  return project;
}
