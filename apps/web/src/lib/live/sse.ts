import type { LiveEvent } from "@vrt/shared/schemas";

// JSON.stringify escapes newlines, so the payload is always one line - which
// is what keeps a single `data:` field valid. Anything multi-line here would
// silently split into two SSE fields.
export function formatSseFrame(event: LiveEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

// A comment frame: ignored by EventSource, but it keeps proxies and load
// balancers from closing an idle connection.
export const SSE_KEEP_ALIVE = ": keep-alive\n\n";

export const SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  // nginx buffers proxied responses by default, which would hold events back
  // until the buffer fills.
  "X-Accel-Buffering": "no",
};
