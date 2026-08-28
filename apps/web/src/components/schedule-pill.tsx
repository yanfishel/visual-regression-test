"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import type { SchedulePillContent } from "@/lib/schedule-display";
import { ClockIcon } from "./icons";

// The at-a-glance cadence marker: on every /projects card (always
// rendered, even for a project with no schedule at all - state "off" - so
// the feature is discoverable rather than only visible once someone has
// found the dialog) and at the head of the project page's schedule row.
// `label` carries the state alone: Radix tooltips don't open on tap, so a
// touch user only ever sees the pill text - `detail` is an addition, never
// the only carrier, and is optional: the project page's row spells the
// cadence out right beside the pill, so a tooltip repeating it would only
// get in the way. Both arrive as finished strings from the server
// (project-card.tsx / lib/schedule-display.ts), so no date is ever read on
// the client.
export function SchedulePill({
  state,
  label,
  detail,
}: Omit<SchedulePillContent, "detail"> & { detail?: string }) {
  // `shrink-0` keeps the label ("Off" / "On" / "Paused") on one line in the
  // card's counts row - a flex item may shrink below its content otherwise,
  // and wrapping the whole pill onto the next line is the intended fallback,
  // not breaking the word inside it.
  const classes = ["pill", "pill-new", "pill-busy", "w-fit", "shrink-0", state !== "on" && "opacity-60"]
    .filter(Boolean)
    .join(" ");
  const body = (
    <>
      <ClockIcon className="h-3.5 w-3.5" />
      {label}
    </>
  );

  if (detail === undefined) {
    return <span className={classes}>{body}</span>;
  }

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        {/* Above the card's stretched link overlay (z-[1] in project-card.tsx)
            so the trigger is reachable at all, by pointer and by keyboard
            (tabIndex makes it focusable - Radix opens on focus too). */}
        <span tabIndex={0} className={`${classes} relative z-10 cursor-default`}>
          {body}
        </span>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="top"
          sideOffset={6}
          className="z-50 max-w-xs select-none rounded-md bg-text px-2.5 py-1.5 text-xs font-medium text-bg shadow-md"
        >
          {detail}
          <Tooltip.Arrow className="fill-text" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
