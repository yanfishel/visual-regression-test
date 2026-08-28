"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { deleteProjectAction } from "@/app/(app)/projects/actions";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { TrashIcon } from "./icons";
import { Modal } from "./modal";

// The way to delete a project - from a /projects card (icon trigger) or the
// project page's config-card footer (labeled button trigger, which redirects
// back to the list since the page it sat on is gone). Confirmation goes
// through the shared Modal - deletion cascades to every run, shot and
// baseline, so it never hangs off a bare button.
export function DeleteProjectDialog({
  projectId,
  projectName,
  trigger = "icon",
  redirectToProjects = false,
}: {
  projectId: string;
  projectName: string;
  // "icon" is the /projects card's quiet trigger (danger on hover only,
  // labeled by a tooltip); "button" is the project page's red
  // "Delete project" button - labeled by its own text, so no tooltip.
  trigger?: "icon" | "button";
  redirectToProjects?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(deleteProjectAction, EMPTY_FORM_STATE);
  const wasPending = useRef(false);
  // The action's last result outlives the dialog, so a failed delete would
  // still be on screen the next time it opened - same guard as ProjectDialog.
  const [showError, setShowError] = useState(false);

  // A successful delete revalidates the list and this card unmounts with it,
  // but close explicitly anyway (an admin's stale card, a slow refresh)
  // - same pattern as ProjectDialog's save.
  useEffect(() => {
    if (wasPending.current && !isPending) {
      if (state.error === null) {
        setOpen(false);
      } else {
        setShowError(true);
      }
    }
    wasPending.current = isPending;
  }, [isPending, state]);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setShowError(false);
    }
    setOpen(nextOpen);
  }

  return (
    <>
      {trigger === "button" ? (
        // Same padding as the Edit button beside it, so the two line up.
        <button
          type="button"
          onClick={() => handleOpenChange(true)}
          aria-label={`Delete project ${projectName}`}
          className="btn btn-danger px-3 py-1.5"
        >
          <TrashIcon />
          Delete project
        </button>
      ) : (
        // Radix tooltip (project rule - never the native `title`), fed by
        // the provider in the root layout.
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <button
              type="button"
              onClick={() => handleOpenChange(true)}
              aria-label={`Delete project ${projectName}`}
              className="btn-icon hover:bg-danger-soft hover:text-danger"
            >
              <TrashIcon />
            </button>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              side="bottom"
              sideOffset={6}
              className="z-50 select-none rounded-md bg-text px-2 py-1 text-xs font-medium text-bg shadow-md"
            >
              Delete project
              <Tooltip.Arrow className="fill-text" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      )}

      <Modal
        open={open}
        onOpenChange={handleOpenChange}
        title="Delete project"
        description="This removes the project and everything captured for it."
        size="sm"
      >
        <form action={formAction} className="px-6 py-5">
          <input type="hidden" name="projectId" value={projectId} />
          {redirectToProjects && <input type="hidden" name="redirectToProjects" value="1" />}
          <p className="text-sm text-text-muted">
            <strong className="font-semibold text-text">{projectName}</strong> will be deleted along with all
            of its runs, screenshots and approved baselines. This can&apos;t be undone.
          </p>
          {showError && state.error && <p className="mt-4 text-sm text-danger">{state.error}</p>}
          <div className="mt-8 flex justify-end gap-2">
            <button type="button" onClick={() => handleOpenChange(false)} className="btn btn-quiet shrink-0">
              Cancel
            </button>
            <button type="submit" disabled={isPending} className="btn btn-danger shrink-0">
              <TrashIcon />
              {isPending ? "Deleting…" : "Delete project"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
