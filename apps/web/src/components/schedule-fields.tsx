"use client";

import { useEffect, useState } from "react";
import { maxRunsPerDay, SCHEDULE_WINDOWS, type ScheduleWindow } from "@vrt/shared/schedule";
import {
  allowedRunCounts,
  describeRunTimes,
  OFF_SCHEDULE,
  planCeilingText,
  runCountReducedText,
  SCHEDULE_PHRASE,
  windowCeilingText,
  zeroLimitScheduleText,
} from "@/lib/schedule-display";
import { ScheduleDayStrip } from "./schedule-day-strip";
import { SelectMenu } from "./select-menu";

export interface ScheduleDraft {
  /** Saving `enabled: false` deletes the schedule row. */
  enabled: boolean;
  runsPerDay: number;
  window: ScheduleWindow;
}

// Re-exported so client callers (project-dialog.tsx) can import it alongside
// ScheduleFields; the canonical value lives in lib/schedule-display.ts so
// server components can use it too - see that module's comment.
export { OFF_SCHEDULE };

// The window options complete the sentence "Run 6 times ..." - "a night",
// "during the day", "a day" - the same phrases describeSchedule uses on the
// project page, so what the reader picks here is what they read there.
const WINDOW_OPTIONS = SCHEDULE_WINDOWS.map((window) => ({
  value: window,
  label: SCHEDULE_PHRASE[window],
}));

// Off / On as a segmented control over two real radio inputs: the inputs
// keep the radio-group semantics and keyboard model (arrow keys move the
// selection) that ui.md "Scheduling" asks for - a third state, Paused,
// lives in a different control, so this must read as a choice between two
// named states, not a switch - while the labels draw the segments. The
// input is visually hidden, so the focus ring is drawn on its segment.
// One track (`surface-alt`), one raised segment (`surface` + shadow) - the
// segment that is *not* chosen paints nothing, so the control reads as one
// piece with one highlighted half rather than two adjacent boxes.
function ScheduleToggle({ enabled, onChange }: { enabled: boolean; onChange: (enabled: boolean) => void }) {
  const segment =
    "block cursor-pointer rounded-[3px] px-3.5 py-1 text-sm font-medium text-text-muted transition hover:text-text peer-checked:bg-surface peer-checked:font-semibold peer-checked:text-accent peer-checked:shadow-sm peer-focus-visible:ring-2 peer-focus-visible:ring-accent";
  return (
    <div
      role="radiogroup"
      aria-label="Run schedule"
      className="inline-flex gap-0.5 rounded-sm bg-surface-alt p-0.5"
    >
      <label>
        <input
          type="radio"
          name="schedule-enabled"
          checked={!enabled}
          onChange={() => onChange(false)}
          className="peer sr-only"
        />
        <span className={segment}>Off</span>
      </label>
      <label>
        <input
          type="radio"
          name="schedule-enabled"
          checked={enabled}
          onChange={() => onChange(true)}
          className="peer sr-only"
        />
        <span className={segment}>On</span>
      </label>
    </div>
  );
}

export function ScheduleFields({
  value,
  onChange,
  timeZone,
  automatedRunLimit,
  automatedRunsUsed,
  hasPages,
}: {
  value: ScheduleDraft;
  onChange: (next: ScheduleDraft) => void;
  /** The viewer's IANA zone; stored with the schedule when it is saved. */
  timeZone: string;
  /** This project's allowance; `null` for admins (no limits row). */
  automatedRunLimit: number | null;
  /** Automated runs this project already used in the last 24 hours. */
  automatedRunsUsed: number;
  hasPages: boolean;
}) {
  const countOptions = allowedRunCounts(value.window, automatedRunLimit).map((count) => ({
    value: String(count),
    label: String(count),
  }));
  const ceiling = countOptions.length;
  // Whichever bound is tighter is the one the ceiling sentence names - a
  // silently short list is the failure that sentence exists to prevent.
  const windowCeiling = maxRunsPerDay(value.window);
  const boundByPlan = automatedRunLimit !== null && automatedRunLimit < windowCeiling;

  // A schedule saved under a higher plan limit can outlive it: the window's
  // own ceiling is a fixed constant (never the cause here), so the only way
  // a stored runsPerDay lands above `ceiling` on load is a plan reduction
  // since the save (an admin editing /settings). Captured once per mount -
  // this component remounts fresh every time the dialog opens - so the
  // notice survives the clamp below instead of clearing itself the instant
  // it fires; a deliberate later choice by the reader (picking a count or a
  // window themselves) clears it instead, in the handlers below. Guarded by
  // `ceiling > 0` so the `automatedRunLimit === 0` empty state below never
  // gets clamped toward a nonsensical "0 times a day".
  const [reducedFrom, setReducedFrom] = useState<number | null>(() =>
    ceiling > 0 && value.runsPerDay > ceiling ? value.runsPerDay : null,
  );

  useEffect(() => {
    // Persist the correction into the draft itself, not just the display, so
    // Save submits the count the reader is actually shown rather than the
    // stale one - never during render (onChange updates the parent's state),
    // hence the effect. Idempotent: once runsPerDay <= ceiling this is a
    // no-op, so re-running whenever value/ceiling change (e.g. after a
    // deliberate handleWindowChange clamp, which already lands in range) is
    // harmless.
    if (ceiling > 0 && value.runsPerDay > ceiling) {
      onChange({ ...value, runsPerDay: ceiling });
    }
  }, [value, ceiling, onChange]);

  // A role's limit can drop to 0 while a project already has a schedule
  // (/settings allows it; allowedRunCounts correctly yields no choices for
  // it). The panel below replaces the Off/On control entirely, so nothing on
  // screen can flip `enabled` back to false by hand - without this effect,
  // a project whose owner's plan dropped to zero would submit
  // `schedule.enabled: true` on every save (project-dialog.tsx) and get
  // refused by writeProjectSchedule's own limit check forever, since the
  // dialog is the only write path for pages and viewports too (CLAUDE.md
  // §9). An effect, not an onChange during render, for the same reason the
  // clamp above is one.
  useEffect(() => {
    if (automatedRunLimit === 0 && value.enabled) {
      onChange({ ...value, enabled: false });
    }
  }, [automatedRunLimit, value, onChange]);

  if (automatedRunLimit === 0) {
    return <p className="text-sm text-text-muted">{zeroLimitScheduleText()}</p>;
  }

  function handleWindowChange(nextWindow: ScheduleWindow) {
    setReducedFrom(null);
    const nextCeiling = allowedRunCounts(nextWindow, automatedRunLimit).length;
    onChange({
      ...value,
      window: nextWindow,
      runsPerDay: Math.min(value.runsPerDay, Math.max(nextCeiling, 1)),
    });
  }

  // The dropdown must always show a count its own options contain - a stale
  // value from before a plan reduction (see reducedFrom above) renders blank
  // in Radix otherwise, and the lines below would describe a count nobody
  // sees selected. The effect above corrects the draft itself a tick later;
  // this keeps the very first paint coherent too.
  const displayRunsPerDay = Math.min(value.runsPerDay, ceiling);

  return (
    <div className="space-y-4">
      <ScheduleToggle enabled={value.enabled} onChange={(enabled) => onChange({ ...value, enabled })} />

      {value.enabled ? (
        <div className="space-y-3">
          {/* One sentence, its two blanks the two choices: "Run [6] times
              [during the day]". */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Run</span>
            <SelectMenu
              value={String(displayRunsPerDay)}
              options={countOptions}
              onValueChange={(next) => {
                setReducedFrom(null);
                onChange({ ...value, runsPerDay: Number(next) });
              }}
              ariaLabel="Runs per day"
              className="w-20"
            />
            <span>{displayRunsPerDay === 1 ? "time" : "times"}</span>
            <SelectMenu
              value={value.window}
              options={WINDOW_OPTIONS}
              onValueChange={(next) => handleWindowChange(next as ScheduleWindow)}
              ariaLabel="Time of day"
              className="w-48"
            />
          </div>

          <ScheduleDayStrip window={value.window} runsPerDay={displayRunsPerDay} />

          <div className="space-y-1 text-xs text-text-muted">
            {/* The times are derived, never restated, so this line can never
                drift from what the schedule will actually do - and naming the
                zone here is what keeps "22:00" from being misread in the
                reader's own zone. */}
            <p>
              At {describeRunTimes({ runsPerDay: displayRunsPerDay, window: value.window, timeZone })}, in{" "}
              {timeZone}.
            </p>
            {automatedRunLimit !== null && (
              <p>
                Uses {displayRunsPerDay} of this project&rsquo;s {automatedRunLimit} daily automated runs
                {automatedRunsUsed > 0 && ` (${automatedRunsUsed} already used in the last 24 h)`}.
              </p>
            )}

            {/* Only worth a line when something is actually cut short - "any"
                with no plan limit already offers the full 1..24. */}
            {(boundByPlan || windowCeiling < 24) && (
              <p className="text-text-faint">
                {boundByPlan ? planCeilingText(automatedRunLimit as number) : windowCeilingText(value.window)}
              </p>
            )}

            {/* Distinct from the ceiling sentence above: that one explains what
                the limit is, this one explains that the reader's own saved
                choice was just moved - silently clamping the dropdown would
                still leave them wondering where their count went. */}
            {reducedFrom !== null && <p className="text-warning">{runCountReducedText(reducedFrom)}</p>}

            {!hasPages && (
              <p className="text-warning">This project has no pages yet, so the schedule will not fire.</p>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-text-muted">This project runs only when you press Run.</p>
      )}
    </div>
  );
}
