import type { LiveQueueState } from "@vrt/shared/schemas";

/**
 * Whether a freshly loaded queue state is worth putting on the wire.
 *
 * The bridge polls for expired worker heartbeats (nothing in Redis announces
 * a TTL running out), and most polls find exactly what the last one did -
 * publishing those would wake every SSE client every few seconds for nothing.
 */
export function hasQueueChanged(previous: LiveQueueState | null, next: LiveQueueState): boolean {
  if (!previous) {
    return true;
  }
  return (
    previous.waiting !== next.waiting ||
    previous.active !== next.active ||
    previous.workersOnline !== next.workersOnline
  );
}
