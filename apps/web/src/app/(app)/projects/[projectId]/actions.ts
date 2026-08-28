"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { computeNextRunAt, saveProjectSchema, toggleScheduleSchema } from "@vrt/shared";
import {
  assertNoActiveRun,
  automatedRunLimitFor,
  baselines,
  db,
  pages,
  projects,
  projectSchedules,
  runs,
  viewports,
} from "@vrt/db";
import { getRunQueue } from "@/lib/queue";
import { getCurrentUser } from "@/lib/auth/user";
import { findProjectForUser, resolveProjectOwner } from "@/lib/authz";
import { BaselineProtectedError, findBaselineConflicts } from "@/lib/baseline-guard";
import { releaseFaviconFile } from "@/lib/favicon-release";
import {
  ACTION_OK,
  EMPTY_FORM_STATE,
  parseJsonPayload,
  toFormError,
  type ActionResult,
  type FormState,
} from "@/lib/form-state";
import { diffPageSelection } from "@/lib/page-selection";
import { assertPageQuota } from "@/lib/quota";
import { assertAffordableCount, writeProjectSchedule } from "@/lib/schedule-write";
import { diffViewportSelection } from "@/lib/viewport-selection";

// The project dialog edits everything at once and submits the whole project,
// so this is the only write path for pages and viewports after creation:
// what it receives is the intended end state, and the diff decides the writes.
export async function saveProjectAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  try {
    const input = saveProjectSchema.parse(parseJsonPayload(formData));
    const user = await getCurrentUser();

    // The favicon belongs to the site, not the project: a base URL change
    // drops the stored one (the next run captures the new site's) and, once
    // the transaction has committed, releases its file if nothing else
    // references it.
    const releasedFaviconKey = await db.transaction(async (tx) => {
      // Re-verify ownership inside the action - the projectId in the payload
      // is client-supplied and must never be trusted on its own.
      const project = await findProjectForUser(tx, input.projectId, user);
      if (!project) {
        throw new Error("Project not found");
      }
      await assertPageQuota(tx, user, input.pages.length);

      // Read inside the transaction so the diff below is computed against the
      // same state the writes will run on, not a snapshot that a concurrent
      // save could have invalidated in between.
      const [existingPages, existingViewports] = await Promise.all([
        tx.query.pages.findMany({ where: eq(pages.projectId, input.projectId) }),
        tx.query.viewports.findMany({ where: eq(viewports.projectId, input.projectId) }),
      ]);

      const pageDiff = diffPageSelection(existingPages, input.pages);
      // A row that matches no preset (e.g. restored from an old backup) is
      // deleted here too - see the comment on diffViewportSelection. The
      // baseline guard right below still protects its shots if it's an
      // approved baseline.
      const viewportDiff = diffViewportSelection(existingViewports, input.viewportPresetIds);

      if (pageDiff.toDeleteIds.length > 0 || viewportDiff.toDeleteIds.length > 0) {
        // The schema's ON DELETE RESTRICT on baselines.shot_id can't catch
        // this - the cascade removes the baselines row before the shots are
        // checked (see baseline-guard.ts) - so enforce it here.
        const projectBaselines = await tx.query.baselines.findMany({
          where: eq(baselines.projectId, input.projectId),
          columns: { pageId: true, viewportId: true },
        });
        if (findBaselineConflicts(projectBaselines, pageDiff.toDeleteIds, viewportDiff.toDeleteIds)) {
          throw new BaselineProtectedError();
        }
      }

      const baseUrlChanged = input.baseUrl !== project.baseUrl;
      await tx
        .update(projects)
        .set({
          name: input.name,
          baseUrl: input.baseUrl,
          notifyOnFailure: input.notifyOnFailure,
          ...(baseUrlChanged ? { faviconKey: null } : {}),
        })
        .where(eq(projects.id, input.projectId));

      if (pageDiff.toInsert.length > 0) {
        await tx
          .insert(pages)
          .values(pageDiff.toInsert.map((page) => ({ projectId: input.projectId, ...page })));
      }
      for (const page of pageDiff.toUpdate) {
        const { id, ...values } = page;
        await tx.update(pages).set(values).where(eq(pages.id, id));
      }
      if (pageDiff.toDeleteIds.length > 0) {
        await tx.delete(pages).where(inArray(pages.id, pageDiff.toDeleteIds));
      }

      if (viewportDiff.toInsert.length > 0) {
        await tx.insert(viewports).values(
          viewportDiff.toInsert.map((preset) => ({
            projectId: input.projectId,
            label: preset.label,
            width: preset.width,
            height: preset.height,
            deviceScaleFactor: preset.deviceScaleFactor,
          })),
        );
      }
      if (viewportDiff.toDeleteIds.length > 0) {
        await tx.delete(viewports).where(inArray(viewports.id, viewportDiff.toDeleteIds));
      }

      // The limit that applies is the project OWNER's, not the viewer's - an
      // admin editing someone else's project must be checked against that
      // owner's allowance (see resolveProjectOwner's comment in authz.ts).
      const owner = await resolveProjectOwner(tx, project, user);
      await writeProjectSchedule(tx, input.projectId, input.schedule, owner);

      return baseUrlChanged ? project.faviconKey : null;
    });

    if (releasedFaviconKey !== null) {
      await releaseFaviconFile(db, releasedFaviconKey);
    }

    revalidatePath(`/projects/${input.projectId}`);
    revalidatePath("/");
  } catch (error) {
    // redirect()/notFound() throw control-flow errors Next must see unwrapped;
    // everything else becomes an inline form error.
    unstable_rethrow(error);
    return { ...EMPTY_FORM_STATE, error: describeSaveError(error) };
  }

  return EMPTY_FORM_STATE;
}

// The baseline guard above is the primary protection; the 23503 branch stays
// as a backstop for any other FK path that still reaches the driver (e.g.
// deleting a run whose shot is the current baseline).
function describeSaveError(error: unknown): string {
  if (error instanceof BaselineProtectedError) {
    return error.message;
  }
  if (typeof error === "object" && error !== null && "code" in error && error.code === "23503") {
    return "Can't remove a page or viewport whose shots are still an approved baseline.";
  }
  return toFormError(error);
}

export async function triggerRunAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  let runId: string;
  let projectId: string;
  try {
    projectId = z.string().uuid().parse(formData.get("projectId"));
    const user = await getCurrentUser();

    const run = await db.transaction(async (tx) => {
      const project = await findProjectForUser(tx, projectId, user);
      if (!project) {
        throw new Error("Project not found");
      }
      // Manual runs are not quota-limited (CLAUDE.md §12) - the only thing
      // refused here is a second concurrent run of the same project.
      await assertNoActiveRun(tx, projectId);
      const [created] = await tx
        .insert(runs)
        .values({ projectId, status: "queued", trigger: "manual" })
        .returning();
      if (!created) {
        throw new Error("Failed to create run");
      }
      return created;
    });
    runId = run.id;
  } catch (error) {
    // redirect()/notFound() throw control-flow errors Next must see unwrapped;
    // everything else becomes an inline form error.
    unstable_rethrow(error);
    return { ...EMPTY_FORM_STATE, error: toFormError(error) };
  }

  try {
    // The worker re-reads pages/viewports from the DB at job time, so the
    // queue payload only needs the run id - see runJobDataSchema.
    await getRunQueue().add("run", { runId });
  } catch {
    // Without this, a failed enqueue (e.g. Redis down) leaves the run row
    // `queued` forever with no job behind it - the exact silent-stuck-run
    // failure the live worker indicator exists to surface.
    await db
      .update(runs)
      .set({ status: "failed", finishedAt: new Date(), error: "Failed to enqueue run job" })
      .where(eq(runs.id, runId));
    return { ...EMPTY_FORM_STATE, error: "Failed to enqueue run job" };
  }

  revalidatePath(`/projects/${projectId}`);
  return EMPTY_FORM_STATE;
}

// Pause/resume is its own action rather than part of the dialog payload: it
// is a one-click operation from the project page, and it must keep the
// cadence (Off in the dialog deletes it). Plain argument + ActionResult, the
// /settings pattern, so the caller can raise a toast.
export async function toggleScheduleAction(payload: unknown): Promise<ActionResult> {
  try {
    const input = toggleScheduleSchema.parse(payload);
    const user = await getCurrentUser();
    const project = await findProjectForUser(db, input.projectId, user);
    if (!project) {
      throw new Error("Project not found");
    }
    const schedule = await db.query.projectSchedules.findFirst({
      where: eq(projectSchedules.projectId, input.projectId),
    });
    if (!schedule) {
      throw new Error("This project has no schedule.");
    }
    if (!input.paused) {
      // A role's limit can shrink while a schedule sits paused (an admin
      // edits role_limits in the meantime); refuse the resume with the same
      // explaining message the dialog would have shown, rather than let the
      // scheduler discover it as a silent quota-exceeded skip later.
      // automatedRunLimitFor is the one place this limit is resolved - same
      // function the dialog's write path and the scheduler's guard use.
      // Resolved against the project's OWNER, never the viewer - the same
      // reason saveProjectAction does (see resolveProjectOwner in authz.ts).
      const owner = await resolveProjectOwner(db, project, user);
      const limit = await automatedRunLimitFor(db, owner);
      assertAffordableCount(schedule.runsPerDay, schedule.window, limit);
    }
    await db
      .update(projectSchedules)
      .set({
        paused: input.paused,
        // Resuming recomputes from now: a schedule paused for a week would
        // otherwise be overdue the instant it came back and fire immediately.
        ...(input.paused ? {} : { nextRunAt: computeNextRunAt(schedule, new Date()) }),
      })
      .where(eq(projectSchedules.projectId, input.projectId));
    revalidatePath(`/projects/${input.projectId}`);
    revalidatePath("/projects");
    return ACTION_OK;
  } catch (error) {
    // redirect()/notFound() throw control-flow errors Next must see unwrapped;
    // everything else becomes a message the caller shows as a toast.
    unstable_rethrow(error);
    return { ok: false, error: toFormError(error) };
  }
}
