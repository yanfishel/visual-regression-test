"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { eq } from "drizzle-orm";
import { approveRunSchema } from "@vrt/shared";
import { db, runs } from "@vrt/db";
import { approveComparisons, findPendingApprovalTargets } from "@/lib/approve-comparisons";
import { getCurrentUser } from "@/lib/auth/user";
import { findProjectForUser } from "@/lib/authz";
import { ACTION_OK, toFormError, type ActionResult } from "@/lib/form-state";

// The run page's "Approve all" (whole run or one page group). Takes a
// plain argument and answers with an ActionResult: it's fired from a confirm
// dialog, not a form, and the outcome is reported through a toast - the same
// contract as the autosaving /settings actions (lib/form-state.ts).
export async function approveRunAction(payload: unknown): Promise<ActionResult> {
  try {
    const input = approveRunSchema.parse(payload);
    const user = await getCurrentUser();
    const run = await db.query.runs.findFirst({ where: eq(runs.id, input.runId) });
    // Someone else's run resolves the same as a missing one, so an id guess
    // can't confirm it exists (see lib/authz.ts).
    if (!run || !(await findProjectForUser(db, run.projectId, user))) {
      throw new Error(`Run not found: ${input.runId}`);
    }

    const targets = await findPendingApprovalTargets(db, run.id, input.pageId);
    await approveComparisons(db, targets);

    revalidatePath(`/projects/${run.projectId}/runs/${run.id}`);
    for (const target of targets) {
      revalidatePath(`/projects/${run.projectId}/runs/${run.id}/comparisons/${target.comparisonId}`);
    }
    return ACTION_OK;
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: toFormError(error) };
  }
}
