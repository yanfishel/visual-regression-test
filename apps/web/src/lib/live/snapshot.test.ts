import { describe, expect, it } from "vitest";
import { buildQueueState, buildRunState } from "./snapshot.js";

const RUN = {
  id: "11111111-1111-4111-8111-111111111111",
  projectId: "22222222-2222-4222-8222-222222222222",
  status: "running" as const,
};

describe("buildQueueState", () => {
  it("reads waiting and active counts alongside the worker count", () => {
    expect(buildQueueState({ waiting: 3, active: 1 }, 2)).toEqual({
      waiting: 3,
      active: 1,
      workersOnline: 2,
    });
  });

  it("defaults missing counters to zero - BullMQ omits keys it has no data for", () => {
    expect(buildQueueState({}, 0)).toEqual({ waiting: 0, active: 0, workersOnline: 0 });
  });
});

describe("buildRunState", () => {
  it("carries a valid progress payload through", () => {
    const state = buildRunState(RUN, { phase: "capturing", completed: 1, total: 4, label: "home @ Desktop" });
    expect(state).toEqual({
      runId: RUN.id,
      projectId: RUN.projectId,
      status: "running",
      progress: { phase: "capturing", completed: 1, total: 4, label: "home @ Desktop" },
    });
  });

  it("drops progress that isn't our shape - BullMQ progress is typed `unknown`", () => {
    expect(buildRunState(RUN, 42).progress).toBeNull();
    expect(buildRunState(RUN, { phase: "uploading" }).progress).toBeNull();
    expect(buildRunState(RUN, undefined).progress).toBeNull();
  });
});
