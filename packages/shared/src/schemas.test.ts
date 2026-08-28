import { describe, expect, it } from "vitest";
import {
  createProjectSchema,
  pageInputSchema,
  saveProjectSchema,
  scheduleInputSchema,
  toggleScheduleSchema,
  VIEWPORT_PRESETS,
  runProgressSchema,
  liveEventSchema,
  updateUserRoleSchema,
  saveRoleLimitsSchema,
} from "./index.js";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

const VALID_SCHEDULE = {
  runsPerDay: 3,
  window: "night",
  timeZone: "Asia/Jerusalem",
};

describe("pageInputSchema", () => {
  it("defaults maskSelectors to an empty array", () => {
    const parsed = pageInputSchema.parse({ path: "/", label: "Home" });
    expect(parsed.maskSelectors).toEqual([]);
  });

  it("rejects an empty label", () => {
    expect(() => pageInputSchema.parse({ path: "/", label: "" })).toThrow();
  });
});

describe("createProjectSchema", () => {
  const validInput = {
    name: "example",
    baseUrl: "https://example.com",
    viewportPresetIds: ["desktop", "mobile"],
    pages: [{ path: "/", label: "Home" }],
  };

  it("accepts a name, base url, preset ids and at least one page", () => {
    const parsed = createProjectSchema.parse(validInput);
    expect(parsed.viewportPresetIds).toEqual(["desktop", "mobile"]);
    expect(parsed.pages).toHaveLength(1);
  });

  it("requires at least one viewport preset", () => {
    expect(() => createProjectSchema.parse({ ...validInput, viewportPresetIds: [] })).toThrow();
  });

  it("requires at least one page", () => {
    expect(() => createProjectSchema.parse({ ...validInput, pages: [] })).toThrow();
  });

  it("rejects an unknown viewport preset id", () => {
    expect(() => createProjectSchema.parse({ ...validInput, viewportPresetIds: ["watch"] })).toThrow();
  });

  it("rejects a base url that is not a url", () => {
    expect(() => createProjectSchema.parse({ ...validInput, baseUrl: "example.com" })).toThrow();
  });

  it("drops duplicate preset ids", () => {
    const parsed = createProjectSchema.parse({
      ...validInput,
      viewportPresetIds: ["desktop", "desktop", "tablet"],
    });
    expect(parsed.viewportPresetIds).toEqual(["desktop", "tablet"]);
  });

  it("defaults schedule to null and accepts an explicit one", () => {
    expect(createProjectSchema.parse(validInput).schedule).toBeNull();
    expect(createProjectSchema.parse({ ...validInput, schedule: VALID_SCHEDULE }).schedule).toEqual(
      VALID_SCHEDULE,
    );
  });

  it("defaults notifyOnFailure to false and accepts an explicit true", () => {
    expect(createProjectSchema.parse(validInput).notifyOnFailure).toBe(false);
    expect(createProjectSchema.parse({ ...validInput, notifyOnFailure: true }).notifyOnFailure).toBe(true);
  });
});

describe("saveProjectSchema", () => {
  const validInput = {
    projectId: PROJECT_ID,
    name: "example",
    baseUrl: "https://example.com",
    viewportPresetIds: ["desktop"],
    pages: [{ id: "22222222-2222-4222-8222-222222222222", path: "/", label: "Home" }],
  };

  it("keeps the id of an existing page", () => {
    const parsed = saveProjectSchema.parse(validInput);
    expect(parsed.pages[0]?.id).toBe("22222222-2222-4222-8222-222222222222");
  });

  it("accepts a new page with no id alongside an existing one", () => {
    const parsed = saveProjectSchema.parse({
      ...validInput,
      pages: [...validInput.pages, { path: "/docs", label: "Docs" }],
    });
    expect(parsed.pages[1]?.id).toBeUndefined();
  });

  it("rejects a non-uuid project id", () => {
    expect(() => saveProjectSchema.parse({ ...validInput, projectId: "nope" })).toThrow();
  });

  it("requires at least one page", () => {
    expect(() => saveProjectSchema.parse({ ...validInput, pages: [] })).toThrow();
  });

  it("requires at least one preset", () => {
    expect(() => saveProjectSchema.parse({ ...validInput, viewportPresetIds: [] })).toThrow();
  });

  it("defaults schedule to null and accepts an explicit one", () => {
    expect(saveProjectSchema.parse(validInput).schedule).toBeNull();
    expect(saveProjectSchema.parse({ ...validInput, schedule: VALID_SCHEDULE }).schedule).toEqual(
      VALID_SCHEDULE,
    );
  });

  it("defaults notifyOnFailure to false and accepts an explicit true", () => {
    expect(saveProjectSchema.parse(validInput).notifyOnFailure).toBe(false);
    expect(saveProjectSchema.parse({ ...validInput, notifyOnFailure: true }).notifyOnFailure).toBe(true);
  });
});

describe("scheduleInputSchema", () => {
  it("accepts a full schedule payload", () => {
    expect(scheduleInputSchema.parse(VALID_SCHEDULE)).toEqual(VALID_SCHEDULE);
  });

  it("rejects an unknown window", () => {
    expect(() => scheduleInputSchema.parse({ ...VALID_SCHEDULE, window: "morning" })).toThrow();
  });

  it("rejects a runsPerDay outside the outer 1..24 bound", () => {
    expect(() => scheduleInputSchema.parse({ ...VALID_SCHEDULE, runsPerDay: 0 })).toThrow();
    expect(() => scheduleInputSchema.parse({ ...VALID_SCHEDULE, runsPerDay: 25 })).toThrow();
    expect(() => scheduleInputSchema.parse({ ...VALID_SCHEDULE, runsPerDay: 1.5 })).toThrow();
  });

  it("rejects an empty time zone", () => {
    expect(() => scheduleInputSchema.parse({ ...VALID_SCHEDULE, timeZone: "" })).toThrow();
  });
});

describe("toggleScheduleSchema", () => {
  it("accepts a project id and a pause flag", () => {
    expect(toggleScheduleSchema.parse({ projectId: PROJECT_ID, paused: true })).toEqual({
      projectId: PROJECT_ID,
      paused: true,
    });
  });

  it("rejects a non-uuid project id", () => {
    expect(() => toggleScheduleSchema.parse({ projectId: "nope", paused: true })).toThrow();
  });
});

describe("VIEWPORT_PRESETS", () => {
  it("exposes the three preset widths with a fixed device scale factor of 1", () => {
    expect(VIEWPORT_PRESETS.map((preset) => preset.width)).toEqual([1200, 768, 375]);
    expect(VIEWPORT_PRESETS.every((preset) => preset.deviceScaleFactor === 1)).toBe(true);
  });

  it("keeps preset widths unique - viewport rows are matched back to a preset by width", () => {
    const widths = new Set(VIEWPORT_PRESETS.map((preset) => preset.width));
    expect(widths.size).toBe(VIEWPORT_PRESETS.length);
  });
});

describe("runProgressSchema", () => {
  it("accepts a capturing progress report", () => {
    const parsed = runProgressSchema.parse({
      phase: "capturing",
      completed: 3,
      total: 8,
      label: "home @ Desktop",
    });
    expect(parsed.phase).toBe("capturing");
  });

  it("rejects an unknown phase", () => {
    expect(() =>
      runProgressSchema.parse({ phase: "uploading", completed: 0, total: 1, label: "x" }),
    ).toThrow();
  });

  it("rejects a negative counter", () => {
    expect(() =>
      runProgressSchema.parse({ phase: "capturing", completed: -1, total: 1, label: "x" }),
    ).toThrow();
  });
});

describe("liveEventSchema", () => {
  const queue = { waiting: 1, active: 0, workersOnline: 1 };
  const run = {
    runId: "11111111-1111-4111-8111-111111111111",
    projectId: "22222222-2222-4222-8222-222222222222",
    status: "running",
    progress: null,
  };

  it("parses a snapshot event", () => {
    const parsed = liveEventSchema.parse({ type: "snapshot", queue, runs: [run] });
    expect(parsed.type).toBe("snapshot");
  });

  it("parses a queue event", () => {
    expect(liveEventSchema.parse({ type: "queue", queue }).type).toBe("queue");
  });

  it("parses a run event carrying progress", () => {
    const parsed = liveEventSchema.parse({
      type: "run",
      run: { ...run, progress: { phase: "comparing", completed: 2, total: 8, label: "cv @ Mobile" } },
    });
    expect(parsed.type === "run" && parsed.run.progress?.phase).toBe("comparing");
  });

  it("rejects an unknown event type", () => {
    expect(() => liveEventSchema.parse({ type: "log", message: "hi" })).toThrow();
  });

  it("rejects a run state with an unknown status", () => {
    expect(() => liveEventSchema.parse({ type: "run", run: { ...run, status: "cancelled" } })).toThrow();
  });
});

describe("updateUserRoleSchema", () => {
  it("accepts a uuid and a known role", () => {
    expect(
      updateUserRoleSchema.parse({ userId: "11111111-1111-4111-8111-111111111111", role: "pro" }),
    ).toEqual({ userId: "11111111-1111-4111-8111-111111111111", role: "pro" });
  });

  it("rejects unknown roles", () => {
    expect(() =>
      updateUserRoleSchema.parse({ userId: "11111111-1111-4111-8111-111111111111", role: "owner" }),
    ).toThrow();
  });
});

describe("saveRoleLimitsSchema", () => {
  it("accepts user and pro rows and rejects admin", () => {
    const row = { role: "user", maxProjects: 2, maxPagesPerProject: 5, maxAutomatedRunsPerDay: 5 };
    expect(saveRoleLimitsSchema.parse({ limits: [row] }).limits).toEqual([row]);
    expect(() => saveRoleLimitsSchema.parse({ limits: [{ ...row, role: "admin" }] })).toThrow();
  });

  it("rejects negative and non-integer limits", () => {
    const row = { role: "pro", maxProjects: -1, maxPagesPerProject: 5, maxAutomatedRunsPerDay: 5 };
    expect(() => saveRoleLimitsSchema.parse({ limits: [row] })).toThrow();
  });
});
