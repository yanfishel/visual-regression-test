import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

// Referenced from the vi.mock factories below - the "mock" prefix is what
// exempts these from vitest's hoisting safety check.
const mockRun: { status: string } = { status: "running" };
const mockRunUpdates: Record<string, unknown>[] = [];
const mockNotified: string[] = [];

vi.mock("@vrt/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@vrt/db")>();
  return {
    ...actual,
    db: {
      query: {
        runs: { findFirst: async () => ({ id: "run-1", projectId: "project-1", ...mockRun }) },
        projects: {
          findFirst: async () => ({ id: "project-1", baseUrl: "https://example.com", faviconKey: "x" }),
        },
      },
      update: () => ({
        set: (values: Record<string, unknown>) => ({
          where: async () => {
            mockRunUpdates.push(values);
          },
        }),
      }),
    },
  };
});

vi.mock("./notify.js", () => ({
  notifyRunFinished: async (runId: string) => {
    mockNotified.push(runId);
  },
}));

let tempDir: string;
let diffAgainstBaseline: (typeof import("./run-processor.js"))["diffAgainstBaseline"];
let describeCaptureFailures: (typeof import("./run-processor.js"))["describeCaptureFailures"];
let processRun: (typeof import("./run-processor.js"))["processRun"];

beforeAll(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), "vrt-storage-"));
  process.env.STORAGE_DRIVER = "local";
  process.env.STORAGE_LOCAL_PATH = tempDir;
  ({ diffAgainstBaseline, describeCaptureFailures, processRun } = await import("./run-processor.js"));
});

beforeEach(() => {
  mockRunUpdates.length = 0;
  mockNotified.length = 0;
});

// A worker killed mid-run leaves its run `running`; BullMQ then hands the job
// to the next worker as a stalled retry. Re-capturing would duplicate shots,
// so the run is refused - but refusing must also *end* the run, or it stays
// `running` for ever with a healthy idle worker beside it (only a worker
// restart would sweep it, via reconcileStuckRuns).
describe("processRun on a stalled-job retry", () => {
  it("fails the run instead of leaving it running", async () => {
    await expect(processRun("run-1")).rejects.toThrow(/stalled job retry/);

    expect(mockRunUpdates).toHaveLength(1);
    expect(mockRunUpdates[0]).toMatchObject({ status: "failed" });
    expect(mockRunUpdates[0]?.finishedAt).toBeInstanceOf(Date);
    expect(String(mockRunUpdates[0]?.error)).toMatch(/died mid-run/);
  });

  it("tells the owner, the same way a run that failed in flight would", async () => {
    await expect(processRun("run-1")).rejects.toThrow();

    expect(mockNotified).toEqual(["run-1"]);
  });
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("describeCaptureFailures", () => {
  it("summarises the count only - the per-capture detail lives in capture_failures rows", () => {
    expect(describeCaptureFailures(3, 6)).toBe("3 of 6 captures failed");
    expect(describeCaptureFailures(1, 1)).toBe("1 of 1 captures failed");
  });
});

describe("diffAgainstBaseline", () => {
  it("aligns to the shared top region and reports the height delta when page height changed", async () => {
    // Same width, same solid color in the shared top 50px - only the
    // current shot is taller, simulating a page that grew by 10px.
    const baselineBuffer = await sharp({
      create: { width: 100, height: 50, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
    const currentBuffer = await sharp({
      create: { width: 100, height: 60, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();

    const result = await diffAgainstBaseline(baselineBuffer, currentBuffer, 0.01);

    expect(result.status).toBe("passed");
    expect(result.heightDelta).toBe(10);
    expect(result.widthDelta).toBe(0);
  });

  it("reports the width delta separately when the widths differ, instead of dropping it", async () => {
    // Same solid color; the current shot is 10px narrower and 10px taller.
    // The shared 90x50 region matches, so the comparison passes - but both
    // dimension changes must be reported, not silently folded into height.
    const baselineBuffer = await sharp({
      create: { width: 100, height: 50, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
    const currentBuffer = await sharp({
      create: { width: 90, height: 60, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();

    const result = await diffAgainstBaseline(baselineBuffer, currentBuffer, 0.01);

    expect(result.status).toBe("passed");
    expect(result.heightDelta).toBe(10);
    expect(result.widthDelta).toBe(-10);
  });

  // Guards the trap documented in CLAUDE.md section 6: the project's
  // diffThreshold is an aggregate budget as a 0-1 fraction, while odiff
  // reports diffPercentage in percent - so 0.01 must be compared as 1%.
  // A regression to comparing the raw fraction would fail the first case.
  it("passes when the aggregate diff is within the project threshold", async () => {
    const image = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();

    const fakeCompare = (async () => ({
      match: false,
      reason: "pixel-diff",
      diffCount: 50,
      diffPercentage: 0.5,
    })) as unknown as Parameters<typeof diffAgainstBaseline>[3];

    const result = await diffAgainstBaseline(image, image, 0.01, fakeCompare);

    expect(result.status).toBe("passed");
    expect(result.diffScore).toBe(0.5);
  });

  it("fails when the aggregate diff exceeds the project threshold", async () => {
    const image = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();

    const fakeCompare = (async () => ({
      match: false,
      reason: "pixel-diff",
      diffCount: 150,
      diffPercentage: 1.5,
    })) as unknown as Parameters<typeof diffAgainstBaseline>[3];

    const result = await diffAgainstBaseline(image, image, 0.01, fakeCompare);

    expect(result.status).toBe("failed");
    expect(result.diffScore).toBe(1.5);
  });

  it("throws when odiff reports the baseline file is missing, instead of silently failing the comparison", async () => {
    const someImage = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();

    // odiff hitting its own file-not-exists case (e.g. a filesystem race on
    // the freshly-written temp file) can't be reproduced deterministically
    // through the real odiff binary, so this one dependency is faked -
    // everything else in the test (the images) is real.
    const fakeCompare = (async () => ({
      match: false,
      reason: "file-not-exists",
      file: "/some/temp/path.png",
    })) as unknown as Parameters<typeof diffAgainstBaseline>[3];

    await expect(diffAgainstBaseline(someImage, someImage, 0.01, fakeCompare)).rejects.toThrow();
  });
});
