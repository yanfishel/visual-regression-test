import { describe, expect, it } from "vitest";
import type { LiveEvent } from "@vrt/shared/schemas";
import { formatSseFrame, SSE_HEADERS, SSE_KEEP_ALIVE } from "./sse.js";

describe("formatSseFrame", () => {
  it("serializes an event as a single data line terminated by a blank line", () => {
    const event: LiveEvent = { type: "queue", queue: { waiting: 2, active: 1, workersOnline: 1 } };
    expect(formatSseFrame(event)).toBe(
      `data: {"type":"queue","queue":{"waiting":2,"active":1,"workersOnline":1}}\n\n`,
    );
  });

  it("never emits a bare newline inside the payload", () => {
    const event: LiveEvent = {
      type: "run",
      run: {
        runId: "11111111-1111-4111-8111-111111111111",
        projectId: "22222222-2222-4222-8222-222222222222",
        status: "running",
        progress: { phase: "capturing", completed: 0, total: 1, label: "home\n@ Desktop" },
      },
    };
    const frame = formatSseFrame(event);
    expect(frame.split("\n").filter(Boolean)).toHaveLength(1);
    expect(frame.endsWith("\n\n")).toBe(true);
  });
});

describe("SSE constants", () => {
  it("keeps the connection alive with a comment frame", () => {
    expect(SSE_KEEP_ALIVE).toBe(": keep-alive\n\n");
  });

  it("disables caching and proxy buffering", () => {
    expect(SSE_HEADERS["Content-Type"]).toBe("text/event-stream");
    expect(SSE_HEADERS["Cache-Control"]).toContain("no-transform");
    expect(SSE_HEADERS["X-Accel-Buffering"]).toBe("no");
  });
});
