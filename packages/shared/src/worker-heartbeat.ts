// Worker liveness (CLAUDE.md section 9). The worker refreshes a short-lived
// Redis key on a timer and the web process counts the keys that haven't
// expired yet. Counting Redis connections instead (BullMQ's getWorkers())
// calls a wedged-but-connected worker online; a blocked event loop cannot
// refresh a key, so an expiring one is the closer thing to a liveness check.
export const WORKER_HEARTBEAT_KEY_PREFIX = "vrt:worker:";
export const WORKER_HEARTBEAT_KEY_PATTERN = `${WORKER_HEARTBEAT_KEY_PREFIX}*`;

export const WORKER_HEARTBEAT_INTERVAL_MS = 5_000;
// Three missed beats: long enough that a brief native-call stall doesn't make
// the indicator flap, short enough that a dead worker goes red in ~15 s.
export const WORKER_HEARTBEAT_TTL_MS = 15_000;

export function workerHeartbeatKey(instanceId: string): string {
  return `${WORKER_HEARTBEAT_KEY_PREFIX}${instanceId}`;
}
