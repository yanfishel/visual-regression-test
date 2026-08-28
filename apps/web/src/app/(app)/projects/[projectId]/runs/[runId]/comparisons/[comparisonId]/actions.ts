"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { comparisonIdSchema } from "@vrt/shared";
import { db } from "@vrt/db";
import { approveComparisons, findApprovalTarget } from "@/lib/approve-comparisons";
import { getCurrentUser } from "@/lib/auth/user";
import { canAccessComparison } from "@/lib/authz";
import { nextPendingComparisonId } from "@/lib/comparison-walk";
import { getComparisonViewData } from "./data.js";

export async function approveComparisonAction(formData: FormData): Promise<void> {
  const comparisonId = comparisonIdSchema.parse(formData.get("comparisonId"));
  const user = await getCurrentUser();
  if (!(await canAccessComparison(db, user, comparisonId))) {
    throw new Error(`Comparison not found: ${comparisonId}`);
  }

  const target = await findApprovalTarget(db, comparisonId);
  if (!target) {
    throw new Error(`Comparison not found: ${comparisonId}`);
  }

  await approveComparisons(db, [target]);

  const runPath = `/projects/${target.projectId}/runs/${target.runId}`;
  revalidatePath(runPath);
  revalidatePath(`${runPath}/comparisons/${comparisonId}`);

  // Review flow: approve, move on. The next stop is resolved server-side
  // from the run's own walk (never from a client-supplied href), read after
  // the approval so the just-approved comparison no longer counts as
  // pending. Nothing left to decide → stay on this page.
  const view = await getComparisonViewData(comparisonId, target.runId, target.projectId);
  const nextId = view ? nextPendingComparisonId(view.siblings, view.index) : null;
  if (nextId) {
    redirect(`${runPath}/comparisons/${nextId}`);
  }
}
