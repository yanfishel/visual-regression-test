import { describe, expect, it } from "vitest";
import type { LiveRunState } from "@vrt/shared/schemas";
import { pruneTerminalRuns } from "./prune-runs.js";

const run = (runId: string, status: LiveRunState["status"]): LiveRunState => ({
  runId,
  projectId: "p1",
  status,
  progress: null,
});

describe("pruneTerminalRuns", () => {
  it("drops terminal runs other than the one just updated", () => {
    const runs = {
      r1: run("r1", "done"),
      r2: run("r2", "failed"),
      r3: run("r3", "running"),
    };
    expect(Object.keys(pruneTerminalRuns(runs, "r2"))).toEqual(["r2", "r3"]);
  });

  it("keeps queued and running runs regardless", () => {
    const runs = { r1: run("r1", "queued"), r2: run("r2", "running") };
    expect(pruneTerminalRuns(runs, "r2")).toEqual(runs);
  });
});
