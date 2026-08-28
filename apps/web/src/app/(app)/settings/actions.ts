"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { eq } from "drizzle-orm";
import { saveRoleLimitsSchema, toggleRegistrationSchema, updateUserRoleSchema } from "@vrt/shared";
import { appSettings, db, roleLimits, users } from "@vrt/db";
import { requireAdmin } from "@/lib/auth/user";
import { setRegistrationOpen } from "@/lib/clerk-admin";
import {
  ACTION_OK,
  EMPTY_FORM_STATE,
  parseJsonPayload,
  toFormError,
  type ActionResult,
  type FormState,
} from "@/lib/form-state";

// The two /settings actions below take a plain argument instead of FormData:
// their controls autosave on change, so there is no form to submit and the
// caller needs a result it can turn into a toast (see lib/form-state.ts).
export async function updateUserRoleAction(payload: unknown): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const input = updateUserRoleSchema.parse(payload);
    // Self-demotion protection: the last admin locking themselves out is an
    // unrecoverable state; changing your own role is never needed.
    if (input.userId === admin.id) {
      throw new Error("You can't change your own role.");
    }
    // The none-mode default user (clerk_id NULL) can show up in this table
    // after a database is switched from none to clerk mode - it still owns
    // whatever projects existed before the switch (docs/notes/auth.md), but
    // nobody signs in as it in clerk mode, so its role has no meaning to
    // change.
    const target = await db.query.users.findFirst({ where: eq(users.id, input.userId) });
    if (target?.clerkId === null) {
      throw new Error("The local default user's role can't be changed.");
    }
    await db.update(users).set({ role: input.role }).where(eq(users.id, input.userId));
    revalidatePath("/settings");
    return ACTION_OK;
  } catch (error) {
    // redirect()/notFound() throw control-flow errors Next must see unwrapped;
    // everything else becomes a message the caller shows as a toast.
    unstable_rethrow(error);
    return { ok: false, error: toFormError(error) };
  }
}

export async function saveRoleLimitsAction(payload: unknown): Promise<ActionResult> {
  try {
    await requireAdmin();
    const input = saveRoleLimitsSchema.parse(payload);
    await db.transaction(async (tx) => {
      for (const row of input.limits) {
        await tx
          .insert(roleLimits)
          .values(row)
          .onConflictDoUpdate({
            target: roleLimits.role,
            set: {
              maxProjects: row.maxProjects,
              maxPagesPerProject: row.maxPagesPerProject,
              maxAutomatedRunsPerDay: row.maxAutomatedRunsPerDay,
            },
          });
      }
    });
    revalidatePath("/settings");
    return ACTION_OK;
  } catch (error) {
    // redirect()/notFound() throw control-flow errors Next must see unwrapped;
    // everything else becomes a message the caller shows as a toast.
    unstable_rethrow(error);
    return { ok: false, error: toFormError(error) };
  }
}

export async function toggleRegistrationAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await requireAdmin();
    const input = toggleRegistrationSchema.parse(parseJsonPayload(formData));
    // Clerk first, local row second: if the PATCH fails nothing is saved, so
    // the displayed state can't drift from what Clerk enforces.
    await setRegistrationOpen(input.registrationOpen);
    await db
      .insert(appSettings)
      .values({ id: 1, registrationOpen: input.registrationOpen })
      .onConflictDoUpdate({ target: appSettings.id, set: { registrationOpen: input.registrationOpen } });
    revalidatePath("/settings");
    return EMPTY_FORM_STATE;
  } catch (error) {
    // redirect()/notFound() throw control-flow errors Next must see unwrapped;
    // everything else becomes an inline form error.
    unstable_rethrow(error);
    return { ...EMPTY_FORM_STATE, error: toFormError(error) };
  }
}
