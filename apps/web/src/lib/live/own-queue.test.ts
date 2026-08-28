import { describe, expect, it } from "vitest";
import type { LiveQueueState, LiveRunState } from "@vrt/shared/schemas";
import { deriveOwnQueue } from "./own-queue.js";

const QUEUE: LiveQueueState = { waiting: 7, active: 3, workersOnline: 2 };

function run(runId: string, status: LiveRunState["status"]): LiveRunState {
  return { runId, projectId: "p1", status, progress: null };
}

describe("deriveOwnQueue", () => {
  it("counts the viewer's own queued and running runs instead of the queue's", () => {
    const runs = {
      a: run("a", "queued"),
      b: run("b", "queued"),
      c: run("c", "running"),
    };
    expect(deriveOwnQueue(QUEUE, runs)).toEqual({ waiting: 2, active: 1, workersOnline: 2 });
  });

  it("keeps workersOnline global - it says whether a worker exists at all", () => {
    expect(deriveOwnQueue(QUEUE, {}).workersOnline).toBe(2);
    expect(deriveOwnQueue({ ...QUEUE, workersOnline: 0 }, {}).workersOnline).toBe(0);
  });

  it("ignores finished runs the provider is still holding on to", () => {
    const runs = { a: run("a", "done"), b: run("b", "failed"), c: run("c", "running") };
    expect(deriveOwnQueue(QUEUE, runs)).toEqual({ waiting: 0, active: 1, workersOnline: 2 });
  });

  it("reports an empty queue when the viewer has nothing running", () => {
    expect(deriveOwnQueue(QUEUE, {})).toEqual({ waiting: 0, active: 0, workersOnline: 2 });
  });
});
