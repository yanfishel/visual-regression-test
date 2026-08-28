"use client";

import * as Popover from "@radix-ui/react-popover";
import type { Viewport } from "@vrt/db";
import type { CaptureFailureKind } from "@vrt/shared/constants";
import { CameraOffIcon, InfoIcon } from "@/components/icons";
import { ViewportChip } from "@/components/viewport-chip";
import { CAPTURE_FAILURE_HINT, CAPTURE_FAILURE_LABEL } from "@/lib/capture-failure-display";

/**
 * A run-grid card for a page/viewport pair the worker couldn't capture. Same
 * frame as a shot card (fixed-height preview, title row with the viewport
 * chip and a pill) so the grid stays a grid; the preview slot holds a
 * placeholder instead of an image, and a third row names the reason - one
 * truncated line, the full message and what to do about it behind a Radix
 * popover (never the native `title`). The page isn't named on the card: the
 * run grid groups cards under a page heading.
 */
export function CaptureFailureCard({
  viewport,
  kind,
  message,
}: {
  viewport: Pick<Viewport, "label" | "width"> | undefined;
  kind: CaptureFailureKind;
  message: string;
}) {
  const label = CAPTURE_FAILURE_LABEL[kind];

  return (
    <div className="panel flex flex-col overflow-hidden">
      {/* Height: a shot card's h-44 preview minus the reason row this card
          adds (py-2 + one text-xs line + its bottom border), so both card
          kinds come out the same height; flex-1 lets it stretch to the row
          if a neighbour is taller anyway. */}
      <div className="relative min-h-[calc(9rem-1px)] flex-1 border-b border-border bg-surface-alt">
        <div className="landing-grid absolute inset-0 flex flex-col items-center justify-center gap-2 text-text-faint">
          <CameraOffIcon className="h-6 w-6" />
          <span className="text-xs">Not captured</span>
        </div>
      </div>
      {/* Reason first, title last: the title/pill row then lines up with the
          bottom row of the shot cards beside it. */}
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            type="button"
            className="flex w-full shrink-0 items-center gap-2 border-b border-border px-3 py-2 text-left text-xs text-text-muted transition-colors hover:bg-surface-alt"
          >
            <span className="min-w-0 flex-1 truncate">
              <span className="font-semibold text-danger">{label}</span>
              <span aria-hidden> &middot; </span>
              <span>{message}</span>
            </span>
            <InfoIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="sr-only">Show failure details</span>
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            side="bottom"
            sideOffset={4}
            collisionPadding={12}
            className="panel z-50 w-[min(24rem,calc(100vw-1.5rem))] space-y-2 p-3 shadow-lg"
          >
            <p className="text-sm font-semibold text-danger">{label}</p>
            <p className="break-words font-mono text-xs text-text">{message}</p>
            <p className="text-xs leading-relaxed text-text-muted">{CAPTURE_FAILURE_HINT[kind]}</p>
            <Popover.Arrow className="fill-border" />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {/* Same title row as a shot card's (see the run page): the viewport as
          plain icon + text, the pill on the right. */}
      <div className="flex shrink-0 items-baseline justify-between gap-2 px-3 py-2.5">
        {viewport ? (
          <ViewportChip viewport={viewport} plain />
        ) : (
          <span className="text-sm text-text-muted">Deleted viewport</span>
        )}
        <span className="pill pill-failed shrink-0">capture failed</span>
      </div>
    </div>
  );
}
