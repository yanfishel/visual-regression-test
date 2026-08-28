"use client";

import { useTransition } from "react";
import type { ScheduleSkipReason, ScheduleWindow } from "@vrt/shared/schedule";
import { toggleScheduleAction } from "@/app/(app)/projects/[projectId]/actions";
import { describeSchedule, formatTimeUntil, shouldShowSkip, SKIP_REASON_TEXT } from "@/lib/schedule-display";
import { PauseIcon, PlayIcon } from "./icons";
import { SchedulePill } from "./schedule-pill";
import { useToast } from "./toast";

export interface ScheduleStatusData {
  runsPerDay: number;
  window: ScheduleWindow;
  timeZone: string;
  paused: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
  lastSkippedAt: string | null;
  lastSkipReason: ScheduleSkipReason | null;
  // Request time, not client wall-clock: the project page is force-dynamic
  // and this "use client" component is still server-rendered before it
  // hydrates (lib/time-ago.ts documents the same convention). Reading
  // `new Date()` here would evaluate once on the server and again on
  // hydration, and a schedule due within a minute of the request would
  // render different bucket text on each side - a hydration mismatch React
  // patches with a one-frame flash, worst exactly when someone is watching.
  now: string;
}

/**
 * The schedule row of the project page's configuration card: what the
 * schedule does, when it fires next, and one control to stop it. Pausing
 * keeps the cadence - erasing it is what the dialog's Off is for.
 *
 * Rendered even when the project has no schedule (`schedule === null`),
 * the same way the /projects card always shows its schedule pill: the row
 * then just says so, in the card whose Edit button is where a schedule
 * gets set up - a feature only visible once someone has found the dialog
 * is a feature most people never find (ui.md "Scheduling").
 */
export function ScheduleStatus({
  projectId,
  schedule,
  viewerTimeZone,
}: {
  projectId: string;
  schedule: ScheduleStatusData | null;
  viewerTimeZone: string;
}) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function toggle() {
    if (!schedule) {
      return;
    }
    const resuming = schedule.paused;
    startTransition(async () => {
      const result = await toggleScheduleAction({ projectId, paused: !resuming });
      if (result.ok) {
        toast.success(resuming ? "Schedule resumed" : "Schedule paused");
      } else {
        toast.error(result.error);
      }
    });
  }

  if (!schedule) {
    return (
      <div className="flex min-h-[30px] items-center gap-2.5 border-t border-border pt-3 text-sm text-text-faint">
        <SchedulePill state="off" label="Off" />
        <span>No schedule — set one in Edit</span>
      </div>
    );
  }

  const now = new Date(schedule.now);
  const nextRunAt = new Date(schedule.nextRunAt);
  const skip = {
    lastSkippedAt: schedule.lastSkippedAt ? new Date(schedule.lastSkippedAt) : null,
    lastRunAt: schedule.lastRunAt ? new Date(schedule.lastRunAt) : null,
  };
  const showSkip = !schedule.paused && schedule.lastSkipReason !== null && shouldShowSkip(skip, now);
  const tone = schedule.paused ? "text-text-faint" : "text-text-muted";

  return (
    <div className="border-t border-border pt-3">
      {/* Text left, the one control right - the same "info left, control
          right" strip the shot slider's caption bar draws beside this card. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {/* The pill names the state (On / Paused - the same three-state
            marker as the /projects card), the text beside it the cadence;
            neither repeats the other. */}
        <div className={`flex min-w-0 items-center gap-2.5 text-sm ${tone}`}>
          <SchedulePill state={schedule.paused ? "paused" : "on"} label={schedule.paused ? "Paused" : "On"} />
          <span>
            {describeSchedule(schedule)}
            {/* The schedule keeps the zone it was saved in, so a viewer reading
                from elsewhere is told which clock this is. */}
            {schedule.timeZone !== viewerTimeZone && ` (${schedule.timeZone})`}
            {!schedule.paused && ` · ${formatTimeUntil(nextRunAt, now)}`}
          </span>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          aria-label={schedule.paused ? "Resume schedule" : "Pause schedule"}
          className="btn btn-quiet shrink-0 px-2.5 py-1 text-xs"
        >
          {schedule.paused ? <PlayIcon className="h-4 w-4" /> : <PauseIcon className="h-4 w-4" />}
          {schedule.paused ? "Resume" : "Pause"}
        </button>
      </div>
      {showSkip && schedule.lastSkipReason && (
        // warning, not danger: CLAUDE.md §9 reserves danger for run verdicts,
        // and a skipped occurrence says nothing about the site.
        <p className="mt-1.5 text-sm text-warning">
          Last scheduled run was skipped — {SKIP_REASON_TEXT[schedule.lastSkipReason].label}.{" "}
          <span className="text-text-muted">{SKIP_REASON_TEXT[schedule.lastSkipReason].advice}</span>
        </p>
      )}
    </div>
  );
}
