import { and, eq, inArray, isNotNull, lt, notInArray, sql } from "drizzle-orm";
import { baselines, comparisons, db, shots } from "@vrt/db";
import { createStorageFromEnv } from "@vrt/storage";

// CLAUDE.md section 7 retention: keep every shot for 30 days; after that,
// keep only shots that are a current baseline or belong to a failed
// comparison (either side of it - deleting the baseline side would null the
// comparison's provenance and make its diff unviewable).
const RETENTION_DAYS = 30;
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function selectKeysToDelete(
  deletedKeys: readonly string[],
  stillReferencedKeys: ReadonlySet<string>,
): string[] {
  return [...new Set(deletedKeys)].filter((key) => !stillReferencedKeys.has(key));
}

export async function runRetentionSweep(now: Date = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  // Deleting the rows first keeps the invariant that a shots row always has
  // its file (section 7): a crash between the two steps leaves orphan files,
  // never dangling rows. The baselines FK is RESTRICT, but current baselines
  // are excluded here anyway; comparisons.shot_id cascades and
  // comparisons.baseline_shot_id would SET NULL - protected shots are
  // excluded by the failed-comparison subqueries instead.
  const protectedByBaseline = db.select({ id: baselines.shotId }).from(baselines);
  const protectedAsFailedShot = db
    .select({ id: comparisons.shotId })
    .from(comparisons)
    .where(eq(comparisons.status, "failed"));
  const protectedAsFailedBaseline = db
    .select({ id: sql<string>`${comparisons.baselineShotId}` })
    .from(comparisons)
    .where(and(eq(comparisons.status, "failed"), isNotNull(comparisons.baselineShotId)));

  const deleted = await db
    .delete(shots)
    .where(
      and(
        lt(shots.createdAt, cutoff),
        notInArray(shots.id, protectedByBaseline),
        notInArray(shots.id, protectedAsFailedShot),
        notInArray(shots.id, protectedAsFailedBaseline),
      ),
    )
    .returning({ storageKey: shots.storageKey });

  if (deleted.length === 0) {
    return;
  }

  // Content-addressed keys are shared across runs, so a file is only removed
  // once no surviving row references it.
  const deletedKeys = deleted.map((row) => row.storageKey);
  const survivors = await db
    .selectDistinct({ storageKey: shots.storageKey })
    .from(shots)
    .where(inArray(shots.storageKey, [...new Set(deletedKeys)]));
  const keysToDelete = selectKeysToDelete(deletedKeys, new Set(survivors.map((row) => row.storageKey)));

  const storage = createStorageFromEnv();
  let filesDeleted = 0;
  for (const key of keysToDelete) {
    try {
      await storage.delete(key);
      filesDeleted++;
    } catch (error) {
      // An orphan file is the accepted failure mode - never a dangling row.
      console.error(`Retention sweep failed to delete ${key}:`, error);
    }
  }
  console.log(`Retention sweep: removed ${deleted.length} shot row(s), ${filesDeleted} file(s).`);
}

export function startRetentionSweeps(): void {
  const sweep = (): void => {
    runRetentionSweep().catch((error) => {
      console.error("Retention sweep failed:", error);
    });
  };
  sweep();
  const timer = setInterval(sweep, SWEEP_INTERVAL_MS);
  timer.unref();
}
