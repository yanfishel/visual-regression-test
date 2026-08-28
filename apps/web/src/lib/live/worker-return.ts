/**
 * Whether a worker has just (re)joined, judged from consecutive
 * `workersOnline` counts.
 *
 * A worker reconciles stuck runs as it boots (`reconcileStuckRuns`), and it
 * does that straight in Postgres - no BullMQ job is involved, so no `run`
 * event reaches the page and nothing would otherwise refresh it. A count
 * that went *up* is the one signal the live stream carries that a worker
 * process started, so it stands in for "server state may have changed
 * behind your back".
 *
 * `null` is the state before the first frame: the page was server-rendered
 * with whatever was true then, so its first count is a baseline, not news.
 */
export function workerJoined(previous: number | null, next: number): boolean {
  return previous !== null && next > previous;
}
