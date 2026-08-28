"use client";

import type { RunStatus } from "@vrt/shared/constants";
import { useLiveRun } from "./live-provider";

// Progress lives in the BullMQ job, not in Postgres, so it comes from the live
// stream rather than from a server render. `initialStatus` keeps the bar from
// flashing in for a run that was already finished when the page loaded.
export function RunProgress({ runId, initialStatus }: { runId: string; initialStatus: RunStatus }) {
  const live = useLiveRun(runId);
  const status = live?.status ?? initialStatus;

  if (status !== "queued" && status !== "running") {
    return null;
  }

  const progress = live?.progress ?? null;
  const percent = progress && progress.total > 0 ? (progress.completed / progress.total) * 100 : 0;

  return (
    <div className="panel space-y-2 px-4 py-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">
          {status === "queued" ? "Queued" : progress ? `${progress.phase} ${progress.label}` : "Starting…"}
        </span>
        {progress && (
          <span className="font-mono text-xs text-text-muted">
            {progress.completed}/{progress.total}
          </span>
        )}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-alt">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300"
          style={{ width: `${Math.min(100, Math.max(2, percent))}%` }}
        />
      </div>
    </div>
  );
}
