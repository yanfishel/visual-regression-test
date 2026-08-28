"use client";

import { useActionState } from "react";
import { triggerRunAction } from "@/app/(app)/projects/[projectId]/actions";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { RocketIcon, SpinnerIcon } from "./icons";

// A client wrapper only because quota rejections must render inline instead
// of throwing into the error boundary - the action itself stays on the
// server.
//
// `activeRun` is the project's queued-or-running run, if any: one run per
// project at a time is the rule (`assertNoActiveRun`, CLAUDE.md §12), so
// while one is in flight the button is disabled and *says why* in its own
// label ("Queued…" / "Running…", the outcome pill's spinner) rather than
// going grey without a word. The page is re-rendered by the live feed when
// the run finishes (router.refresh on `run` events), which is what turns
// the button back into "Run" - no client-side polling here.
export function RunButton({
  projectId,
  disabled,
  activeRun = null,
}: {
  projectId: string;
  disabled: boolean;
  activeRun?: "queued" | "running" | null;
}) {
  const [state, formAction, pending] = useActionState(triggerRunAction, EMPTY_FORM_STATE);
  const busy = activeRun !== null;
  return (
    <form action={formAction} className="shrink-0 text-right">
      <input type="hidden" name="projectId" value={projectId} />
      <button type="submit" disabled={disabled || busy || pending} className="btn btn-primary">
        {busy ? (
          <SpinnerIcon className="h-4 w-4 motion-safe:animate-spin" />
        ) : (
          <RocketIcon className="h-4 w-4" />
        )}
        {activeRun === "queued" ? "Queued…" : activeRun === "running" ? "Running…" : "Run"}
      </button>
      {/* role=alert: the rejection appears without a navigation, so screen
          readers need the live-region announcement. */}
      {state.error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
