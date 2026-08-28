"use server";

import { eq } from "drizzle-orm";
import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createProjectSchema, updateEmailSchema, VIEWPORT_PRESETS } from "@vrt/shared";
import { mailConfigFrom } from "@vrt/shared/env";
import { createMailer, renderTestEmail } from "@vrt/mail";
import { db, pages, projects, users, viewports } from "@vrt/db";
import { getAuthMode } from "@/lib/auth/mode";
import { getCurrentUser } from "@/lib/auth/user";
import { hasRealEmail } from "@/lib/auth/email";
import {
  ACTION_OK,
  EMPTY_FORM_STATE,
  parseJsonPayload,
  toFormError,
  type ActionResult,
  type FormState,
} from "@/lib/form-state";
import { ADD_EMAIL_FIRST_MESSAGE, MAIL_NOT_CONFIGURED_MESSAGE } from "@/lib/mail-copy";
import { assertPageQuota, assertProjectQuota } from "@/lib/quota";
import { writeProjectSchedule } from "@/lib/schedule-write";

// A project, its viewports and its pages are created together by the
// new-project dialog, so they go in as one transaction: a half-created project
// with no pages can't be run and would just have to be cleaned up by hand.
export async function createProjectAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  let projectId: string;

  try {
    const input = createProjectSchema.parse(parseJsonPayload(formData));
    const user = await getCurrentUser();

    projectId = await db.transaction(async (tx) => {
      await assertProjectQuota(tx, user);
      await assertPageQuota(tx, user, input.pages.length);
      const [project] = await tx
        .insert(projects)
        .values({
          name: input.name,
          baseUrl: input.baseUrl,
          ownerId: user.id,
          notifyOnFailure: input.notifyOnFailure,
        })
        .returning();
      if (!project) {
        throw new Error("Failed to create project");
      }

      // Insert in preset order, not in the order the user clicked the
      // checkboxes, so every project's viewport list reads the same way.
      const selectedPresets = VIEWPORT_PRESETS.filter((preset) =>
        input.viewportPresetIds.includes(preset.id),
      );
      await tx.insert(viewports).values(
        selectedPresets.map((preset) => ({
          projectId: project.id,
          label: preset.label,
          width: preset.width,
          height: preset.height,
          deviceScaleFactor: preset.deviceScaleFactor,
        })),
      );

      await tx.insert(pages).values(
        input.pages.map((page) => ({
          projectId: project.id,
          path: page.path,
          label: page.label,
          waitSelector: page.waitSelector || null,
          maskSelectors: page.maskSelectors,
        })),
      );

      await writeProjectSchedule(tx, project.id, input.schedule, user);

      return project.id;
    });
  } catch (error) {
    // redirect()/notFound() throw control-flow errors Next must see unwrapped;
    // everything else becomes an inline form error.
    unstable_rethrow(error);
    return { ...EMPTY_FORM_STATE, error: toFormError(error) };
  }

  revalidatePath("/");
  redirect(`/projects/${projectId}`);
}

// None mode only: in clerk mode the address is Clerk's (verified at
// sign-in) and is never edited here. Writes straight into users.email of the
// default row - the same column notifications read (CLAUDE.md §4
// "Notifications").
export async function updateEmailAction(payload: unknown): Promise<ActionResult> {
  try {
    if (getAuthMode() !== "none") {
      throw new Error("In this mode your e-mail address is managed by your account provider");
    }
    const { email } = updateEmailSchema.parse(payload);
    const user = await getCurrentUser();
    await db.update(users).set({ email }).where(eq(users.id, user.id));
    revalidatePath("/", "layout");
    return ACTION_OK;
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: toFormError(error) };
  }
}

// Sends renderTestEmail to the current user's address, directly (not through
// the run queue - a test must not wait behind a ten-minute run).
export async function sendTestEmailAction(): Promise<ActionResult> {
  try {
    const config = mailConfigFrom(process.env);
    if (!config) {
      throw new Error(MAIL_NOT_CONFIGURED_MESSAGE);
    }
    const user = await getCurrentUser();
    if (!hasRealEmail(user)) {
      throw new Error(ADD_EMAIL_FIRST_MESSAGE);
    }
    await createMailer(config).send({
      to: user.email,
      ...renderTestEmail({ appUrl: config.appUrl, to: user.email }),
    });
    return ACTION_OK;
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: toFormError(error) };
  }
}
