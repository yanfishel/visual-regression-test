"use client";

import { useLiveQueue } from "./live-provider";

export function WorkerStatus() {
  const { queue, connected } = useLiveQueue();
  const online = connected && queue.workersOnline > 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm">
        <span
          className={`status-dot ${online ? "bg-success ring-success-soft" : "bg-danger ring-danger-soft"}`}
        />
        {online ? `Worker online (${queue.workersOnline})` : "Worker offline"}
      </div>
      <div className="font-mono text-xs text-text-muted">
        {queue.waiting} queued &middot; {queue.active} active
      </div>
      {!online && queue.waiting > 0 && (
        <p className="text-xs text-danger">Nothing is consuming the queue - start the worker.</p>
      )}
    </div>
  );
}
