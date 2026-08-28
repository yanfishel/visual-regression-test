import { describe, expect, it } from "vitest";
import type { LiveEvent, LiveRunState } from "@vrt/shared/schemas";
import { createEventScope } from "./event-scope.js";

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";

const runState = (projectId: string): LiveRunState => ({
  runId: "33333333-3333-4333-8333-333333333333",
  projectId,
  status: "running",
  progress: null,
});

const runEvent = (projectId: string): LiveEvent => ({ type: "run", run: runState(projectId) });

const queueEvent: LiveEvent = { type: "queue", queue: { waiting: 1, active: 0, workersOnline: 1 } };

const snapshotEvent: LiveEvent = {
  type: "snapshot",
  queue: { waiting: 0, active: 1, workersOnline: 1 },
  runs: [runState(P1), runState(P2)],
};

describe("createEventScope", () => {
  it("admin passes everything through untouched", async () => {
    const scope = createEventScope({ isAdmin: true, loadOwnedProjectIds: async () => [] });
    await scope.prime();
    expect(scope.filter(runEvent(P2))).toEqual(runEvent(P2));
    expect(scope.filter(snapshotEvent)).toEqual(snapshotEvent);
  });

  it("queue events reach everyone", async () => {
    const scope = createEventScope({ isAdmin: false, loadOwnedProjectIds: async () => [] });
    await scope.prime();
    expect(scope.filter(queueEvent)).toEqual(queueEvent);
  });

  it("run events for other projects are dropped", async () => {
    const scope = createEventScope({ isAdmin: false, loadOwnedProjectIds: async () => [P1] });
    await scope.prime();
    expect(scope.filter(runEvent(P1))).toEqual(runEvent(P1));
    expect(scope.filter(runEvent(P2))).toBeNull();
  });

  it("snapshot runs are narrowed to owned projects", async () => {
    const scope = createEventScope({ isAdmin: false, loadOwnedProjectIds: async () => [P1] });
    await scope.prime();
    const filtered = scope.filter(snapshotEvent);
    expect(filtered).not.toBeNull();
    if (filtered && filtered.type === "snapshot") {
      expect(filtered.runs.map((run) => run.projectId)).toEqual([P1]);
    }
  });

  it("an unknown project triggers a refresh and passes on the next event", async () => {
    let owned: string[] = [P1];
    const scope = createEventScope({ isAdmin: false, loadOwnedProjectIds: async () => owned });
    await scope.prime();
    owned = [P1, P2];
    expect(scope.filter(runEvent(P2))).toBeNull(); // miss schedules the refresh
    await Promise.resolve(); // let the refresh settle
    expect(scope.filter(runEvent(P2))).toEqual(runEvent(P2));
  });
});
