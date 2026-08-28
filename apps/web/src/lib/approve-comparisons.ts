import { and, eq, inArray } from "drizzle-orm";
import { baselines, comparisons, pages, shots, type Database } from "@vrt/db";

// Everything approving a comparison needs, resolved through shot -> page:
// baselines.project_id is denormalized and nothing downstream cross-checks
// it against the page, so it comes from the shot's own page - never from a
// client-supplied field.
export interface ApprovalTarget {
  comparisonId: string;
  shotId: string;
  runId: string;
  pageId: string;
  viewportId: string;
  projectId: string;
}

const TARGET_COLUMNS = {
  comparisonId: comparisons.id,
  shotId: shots.id,
  runId: shots.runId,
  pageId: pages.id,
  viewportId: shots.viewportId,
  projectId: pages.projectId,
};

export async function findApprovalTarget(
  database: Database,
  comparisonId: string,
): Promise<ApprovalTarget | null> {
  const rows = await database
    .select(TARGET_COLUMNS)
    .from(comparisons)
    .innerJoin(shots, eq(comparisons.shotId, shots.id))
    .innerJoin(pages, eq(shots.pageId, pages.id))
    .where(eq(comparisons.id, comparisonId))
    .limit(1);
  return rows[0] ?? null;
}

// Statuses the run page's "Approve all" acts on: a diff someone has to
// accept (`failed`) or a pair with no baseline yet (`new`). `passed` is
// deliberately not pending - within threshold means the current baseline
// stands and there is nothing to decide - and `approved` is already done.
export const PENDING_APPROVAL_STATUSES = ["new", "failed"] as const;

// The run page's "Approve all": every pending comparison of the run,
// optionally narrowed to one page for the per-group button.
export async function findPendingApprovalTargets(
  database: Database,
  runId: string,
  pageId?: string,
): Promise<ApprovalTarget[]> {
  return database
    .select(TARGET_COLUMNS)
    .from(comparisons)
    .innerJoin(shots, eq(comparisons.shotId, shots.id))
    .innerJoin(pages, eq(shots.pageId, pages.id))
    .where(
      and(
        eq(shots.runId, runId),
        inArray(comparisons.status, [...PENDING_APPROVAL_STATUSES]),
        pageId ? eq(shots.pageId, pageId) : undefined,
      ),
    );
}

export function isPendingApproval(status: string): boolean {
  return (PENDING_APPROVAL_STATUSES as readonly string[]).includes(status);
}

// Moves the baselines pointer only - old shots are never deleted, see
// CLAUDE.md section 4's approval model. One transaction, so a failure can't
// move a pointer while leaving its comparison unapproved (or approve half a
// run). Sequential upserts rather than one multi-row insert: two targets for
// the same page/viewport pair would make a single INSERT ... ON CONFLICT
// fail with "cannot affect row a second time".
export async function approveComparisons(
  database: Database,
  targets: readonly ApprovalTarget[],
): Promise<void> {
  if (targets.length === 0) {
    return;
  }
  await database.transaction(async (tx) => {
    for (const target of targets) {
      await tx
        .insert(baselines)
        .values({
          projectId: target.projectId,
          pageId: target.pageId,
          viewportId: target.viewportId,
          shotId: target.shotId,
        })
        .onConflictDoUpdate({
          target: [baselines.pageId, baselines.viewportId],
          set: { shotId: target.shotId, updatedAt: new Date() },
        });
    }
    await tx
      .update(comparisons)
      .set({ status: "approved" })
      .where(
        inArray(
          comparisons.id,
          targets.map((target) => target.comparisonId),
        ),
      );
  });
}
