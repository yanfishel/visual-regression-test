import { ZodError } from "zod";

// Shared shape for every `useActionState`-driven form in the app: server
// actions validate with zod and hand the first readable issue back to the
// client instead of throwing into the error boundary.
export interface FormState {
  error: string | null;
}

export const EMPTY_FORM_STATE: FormState = { error: null };

// Result shape for server actions the client calls directly, rather than
// through `useActionState`: the autosaving /settings controls have no form to
// submit and no Save button to report back through, so they take a plain
// argument and get a plain answer they can turn into a toast.
export type ActionResult = { ok: true } | { ok: false; error: string };

export const ACTION_OK: ActionResult = { ok: true };

export function toFormError(error: unknown): string {
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    if (issue) {
      const path = issue.path.filter((segment) => typeof segment === "string").join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    }
  }
  return error instanceof Error ? error.message : "Something went wrong";
}

// Server actions receive their payload as one JSON field rather than many
// form fields: the dialogs hold their state in React (page rows can be added
// and removed), so there is nothing to gain from flat form encoding.
export function parseJsonPayload(formData: FormData): unknown {
  const raw = formData.get("payload");
  if (typeof raw !== "string") {
    throw new Error("Missing form payload");
  }
  return JSON.parse(raw);
}
