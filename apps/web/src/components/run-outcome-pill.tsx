import * as Tooltip from "@radix-ui/react-tooltip";
import { RUN_OUTCOME_CLASS, type RunOutcome } from "@/lib/run-outcome";
import { SpinnerIcon } from "./icons";

// The one run pill for every list and page, showing the run's *outcome*
// (lib/run-outcome.ts) rather than the raw `runs.status`. A run that is
// still queued or running is something to keep an eye on, so instead of the
// static status dot it wears a spinner - the pill's `::before` dot is
// suppressed via `pill-busy` and the icon takes its slot. Server-safe: the
// animation is pure CSS.
//
// `details` (lib/run-failure-details.ts) are the reasons behind a `failed`
// outcome; when given, the pill carries them in a Radix tooltip (never the
// native `title` - project rule; the provider lives in the root layout).
export function RunOutcomePill({
  outcome,
  details = [],
  className,
}: {
  outcome: RunOutcome;
  details?: string[];
  className?: string;
}) {
  const busy = outcome === "queued" || outcome === "running";
  const classes = ["pill", RUN_OUTCOME_CLASS[outcome], busy && "pill-busy", className]
    .filter(Boolean)
    .join(" ");
  const pill = (
    // Focusable when it has something to tell, so the tooltip opens from the
    // keyboard too.
    <span className={classes} tabIndex={details.length > 0 ? 0 : undefined}>
      {busy && <SpinnerIcon className="h-3 w-3 motion-safe:animate-spin" />}
      {outcome}
    </span>
  );

  if (details.length === 0) {
    return pill;
  }
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{pill}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="top"
          sideOffset={6}
          className="z-50 max-w-xs select-none rounded-md bg-text px-2.5 py-1.5 text-xs font-medium text-bg shadow-md"
        >
          {/* A raw worker error can be one long unbreakable token. */}
          <ul className="space-y-0.5 break-words">
            {details.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <Tooltip.Arrow className="fill-text" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
