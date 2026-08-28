"use client";

import { useState, useTransition } from "react";
import { approveRunAction } from "@/app/(app)/projects/[projectId]/runs/[runId]/actions";
import { CheckIcon, SpinnerIcon } from "./icons";
import { Modal } from "./modal";
import { useToast } from "./toast";

// Bulk approve on the run page: the whole run (footer under the grid,
// primary button) or one page group (its heading, quiet button). Both go
// through a confirm modal - one click moves the baseline pointer for many
// pages at once - and report through a toast, since there is no form to
// hand a result back to. Renders nothing when there is nothing to approve.
export function ApproveAllDialog({
  runId,
  pageId,
  pending,
  scope,
  breakdown,
  variant,
}: {
  runId: string;
  // Narrows the approval to one page (the per-group button).
  pageId?: string;
  // Comparisons not yet approved in that scope - what the button promises.
  pending: number;
  // Names the scope inside the dialog, as a phrase after "every pending
  // comparison": "in this run", "of the home page".
  scope: string;
  // Whole-run dialogs list the pending count per page group.
  breakdown?: { label: string; pending: number }[];
  variant: "run" | "group";
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (pending === 0) {
    return null;
  }

  const noun = pending === 1 ? "comparison" : "comparisons";

  function confirm() {
    startTransition(async () => {
      const result = await approveRunAction({ runId, pageId });
      if (result.ok) {
        setOpen(false);
        toast.success(`Approved ${pending} ${noun} as baselines.`);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      {variant === "run" ? (
        // No count on the button itself: the footer beside it says "N
        // comparisons pending".
        <button type="button" onClick={() => setOpen(true)} className="btn btn-primary">
          <CheckIcon className="h-4 w-4" />
          Approve all
        </button>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="btn btn-outline px-3 py-1.5">
          <CheckIcon className="h-4 w-4" />
          Approve
          <span className="btn-count">{pending}</span>
        </button>
      )}

      <Modal
        open={open}
        onOpenChange={setOpen}
        title={`Approve ${pending} ${noun}?`}
        description={`Every pending comparison ${scope} becomes the approved baseline for its page and viewport.`}
        size="sm"
      >
        <div className="px-6 py-5">
          {/* Capped and scrollable: a project can track dozens of pages. */}
          {breakdown && breakdown.length > 1 && (
            <ul className="mb-4 max-h-48 space-y-1 overflow-y-auto pr-1 text-sm">
              {breakdown.map((group, index) => (
                // Index key: two pages may share a label (see comparePages).
                <li key={index} className="flex items-center justify-between gap-4">
                  <span className="min-w-0 truncate font-medium">{group.label}</span>
                  <span className="font-mono text-xs text-text-muted">
                    {group.pending} {group.pending === 1 ? "comparison" : "comparisons"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-sm text-text-muted">
            Only the baseline pointer moves - earlier shots stay in each page&apos;s history.
          </p>
          <div className="mt-8 flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="btn btn-quiet">
              Cancel
            </button>
            <button type="button" onClick={confirm} disabled={isPending} className="btn btn-primary">
              {isPending ? (
                <SpinnerIcon className="h-4 w-4 animate-spin" />
              ) : (
                <CheckIcon className="h-4 w-4" />
              )}
              {isPending ? "Approving…" : `Approve ${pending}`}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
