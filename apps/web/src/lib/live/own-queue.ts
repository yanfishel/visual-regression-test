import type { LiveQueueState, LiveRunState } from "@vrt/shared/schemas";

/**
 * The queue as it concerns one non-admin viewer: how many of *their* runs are
 * waiting and running, rather than the whole installation's backlog.
 *
 * Derived from the runs the provider already holds - the SSE stream narrows
 * those to the user's own projects (lib/live/event-scope.ts), so no extra
 * query is needed and the two figures can never disagree with the run list
 * they came from. `queue` events stay unscoped on the wire because they are
 * also how `workersOnline` arrives.
 *
 * **`workersOnline` is deliberately left global.** It answers "is anything
 * consuming the queue at all", which is the same question for everyone; a
 * per-user version of "worker offline" would mean nothing.
 */
export function deriveOwnQueue(queue: LiveQueueState, runs: Record<string, LiveRunState>): LiveQueueState {
  let waiting = 0;
  let active = 0;
  for (const run of Object.values(runs)) {
    if (run.status === "queued") {
      waiting += 1;
    } else if (run.status === "running") {
      active += 1;
    }
  }
  return { waiting, active, workersOnline: queue.workersOnline };
}
