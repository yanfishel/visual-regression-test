"use client";

import { useActionState } from "react";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { toggleRegistrationAction } from "@/app/(app)/settings/actions";

export function RegistrationToggle({ registrationOpen }: { registrationOpen: boolean }) {
  const [state, formAction, pending] = useActionState(toggleRegistrationAction, EMPTY_FORM_STATE);
  return (
    <form
      action={formAction}
      className="mt-3 flex items-center gap-3"
      onSubmit={(event) => {
        const payload = event.currentTarget.elements.namedItem("payload") as HTMLInputElement;
        payload.value = JSON.stringify({ registrationOpen: !registrationOpen });
      }}
    >
      <input type="hidden" name="payload" defaultValue="" />
      <p className="text-sm text-text-muted">
        Registration is currently {registrationOpen ? "open" : "closed"}.
      </p>
      <button type="submit" disabled={pending} className="btn btn-primary">
        {registrationOpen ? "Close registration" : "Open registration"}
      </button>
      {state.error && (
        <span role="alert" className="text-sm text-danger">
          {state.error}
        </span>
      )}
    </form>
  );
}
