"use client";

import { useLiveQueue } from "./live-provider";

// The failure this feature exists for: a run sits in `queued` forever because
// no worker is connected to the queue, with nothing in the UI saying so.
export function QueuedRunWarning({ hasQueuedRun }: { hasQueuedRun: boolean }) {
  const { queue, connected } = useLiveQueue();

  if (!hasQueuedRun || !connected || queue.workersOnline > 0) {
    return null;
  }

  return (
    <p className="text-sm text-danger">
      No worker is connected - queued runs will not start. Start it with{" "}
      <code className="font-mono">docker compose up -d worker</code>.
    </p>
  );
}
