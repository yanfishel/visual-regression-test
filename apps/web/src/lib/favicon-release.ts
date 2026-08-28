import { eq } from "drizzle-orm";
import { projects, type Database } from "@vrt/db";
import { createStorageFromEnv, type Storage } from "@vrt/storage";

// Created on first use, not at module load: the storage env is only present
// at request time (same reason as the API routes).
let storage: Storage | undefined;

// A project stopped pointing at a favicon file (its base URL changed, or it
// was deleted). Favicon keys are content-addressed and may be shared by
// projects tracking the same site, so the file goes only when no project
// references the key any more. Call it *after* the DB write that dropped
// the pointer has committed. Best-effort: nothing else ever sweeps favicon
// files (the retention sweep is driven by shots rows), so an orphaned
// few-KB file is the accepted failure mode, never a dangling pointer - and
// the worker re-putting the same bytes for another project a moment later
// simply recreates it.
export async function releaseFaviconFile(
  database: Database,
  faviconKey: string,
  storageImpl: Storage = (storage ??= createStorageFromEnv()),
): Promise<void> {
  try {
    const stillUsed = await database
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.faviconKey, faviconKey))
      .limit(1);
    if (stillUsed.length > 0) return;
    await storageImpl.delete(faviconKey);
  } catch (error) {
    console.error(`Failed to release favicon ${faviconKey}:`, error);
  }
}
