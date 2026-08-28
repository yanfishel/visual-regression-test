"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { db } from "@vrt/db";
import { getCurrentUser } from "@/lib/auth/user";
import { deleteProjectOwnedBy } from "@/lib/delete-project";
import { releaseFaviconFile } from "@/lib/favicon-release";
import { EMPTY_FORM_STATE, toFormError, type FormState } from "@/lib/form-state";

export async function deleteProjectAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  try {
    const projectId = z.string().uuid().parse(formData.get("projectId"));
    const user = await getCurrentUser();

    const deleted = await deleteProjectOwnedBy(db, projectId, user);
    if (!deleted) {
      // Same non-confirming answer as every other scoped lookup: a project
      // that isn't yours reads as one that doesn't exist.
      throw new Error("Project not found");
    }
    if (deleted.faviconKey !== null) {
      await releaseFaviconFile(db, deleted.faviconKey);
    }
  } catch (error) {
    // redirect()/notFound() throw control-flow errors Next must see unwrapped;
    // everything else becomes an inline form error.
    unstable_rethrow(error);
    return { ...EMPTY_FORM_STATE, error: toFormError(error) };
  }

  revalidatePath("/projects");
  // Set when the dialog was opened from the deleted project's own page -
  // staying there would just render a 404 on the next refresh.
  if (formData.get("redirectToProjects") !== null) {
    redirect("/projects");
  }
  return EMPTY_FORM_STATE;
}
