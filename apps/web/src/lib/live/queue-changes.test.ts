import { describe, expect, it } from "vitest";
import type { LiveQueueState } from "@vrt/shared/schemas";
import { hasQueueChanged } from "./queue-changes.js";

const QUEUE: LiveQueueState = { waiting: 1, active: 0, workersOnline: 1 };

describe("hasQueueChanged", () => {
  it("publishes the first state it ever sees", () => {
    expect(hasQueueChanged(null, QUEUE)).toBe(true);
  });

  it("stays quiet when nothing moved, so the poll doesn't wake every client", () => {
    expect(hasQueueChanged(QUEUE, { ...QUEUE })).toBe(false);
  });

  it("reports a worker whose heartbeat expired", () => {
    expect(hasQueueChanged(QUEUE, { ...QUEUE, workersOnline: 0 })).toBe(true);
  });

  it("reports a change in queue depth", () => {
    expect(hasQueueChanged(QUEUE, { ...QUEUE, waiting: 2 })).toBe(true);
    expect(hasQueueChanged(QUEUE, { ...QUEUE, active: 1 })).toBe(true);
  });
});
