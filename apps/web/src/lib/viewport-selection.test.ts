import { describe, expect, it } from "vitest";
import type { Viewport } from "@vrt/db";
import { diffViewportSelection, presetIdsOf, presetOf, viewportKindOf } from "./viewport-selection.js";

function viewport(overrides: Partial<Viewport> & { id: string; width: number }): Viewport {
  return {
    projectId: "11111111-1111-4111-8111-111111111111",
    label: "Desktop",
    height: 800,
    deviceScaleFactor: 1,
    createdAt: new Date(0),
    ...overrides,
  } as Viewport;
}

const desktop = viewport({ id: "vp-desktop", width: 1200, label: "Desktop" });
const mobile = viewport({ id: "vp-mobile", width: 375, label: "Mobile", height: 812 });
const legacy = viewport({ id: "vp-legacy", width: 1440, label: "old desktop", height: 900 });

describe("presetOf", () => {
  it("matches a viewport row back to its preset by width", () => {
    expect(presetOf(desktop)?.id).toBe("desktop");
    expect(presetOf(mobile)?.id).toBe("mobile");
  });

  it("returns undefined for a viewport that predates the presets", () => {
    expect(presetOf(legacy)).toBeUndefined();
  });
});

describe("presetIdsOf", () => {
  it("lists the preset ids a project currently has, ignoring legacy rows", () => {
    expect(presetIdsOf([desktop, legacy, mobile])).toEqual(["desktop", "mobile"]);
  });
});

describe("diffViewportSelection", () => {
  it("inserts presets that are selected but missing", () => {
    const { toInsert, toDeleteIds } = diffViewportSelection([desktop], ["desktop", "mobile"]);
    expect(toInsert.map((preset) => preset.id)).toEqual(["mobile"]);
    expect(toDeleteIds).toEqual([]);
  });

  it("deletes viewport rows whose preset was deselected", () => {
    const { toInsert, toDeleteIds } = diffViewportSelection([desktop, mobile], ["desktop"]);
    expect(toInsert).toEqual([]);
    expect(toDeleteIds).toEqual(["vp-mobile"]);
  });

  it("deletes a viewport that matches no preset, even when nothing else changes", () => {
    const { toInsert, toDeleteIds } = diffViewportSelection([desktop, legacy], ["desktop"]);
    expect(toInsert).toEqual([]);
    expect(toDeleteIds).toEqual(["vp-legacy"]);
  });

  it("is a no-op when the selection already matches", () => {
    const { toInsert, toDeleteIds } = diffViewportSelection([desktop, mobile], ["mobile", "desktop"]);
    expect(toInsert).toEqual([]);
    expect(toDeleteIds).toEqual([]);
  });

  it("deletes every duplicate row of a deselected preset", () => {
    const duplicate = viewport({ id: "vp-mobile-2", width: 375, label: "Mobile" });
    const { toDeleteIds } = diffViewportSelection([mobile, duplicate], []);
    expect(toDeleteIds).toEqual(["vp-mobile", "vp-mobile-2"]);
  });

  it("does not insert a preset twice when duplicate rows already exist", () => {
    const duplicate = viewport({ id: "vp-mobile-2", width: 375, label: "Mobile" });
    const { toInsert } = diffViewportSelection([mobile, duplicate], ["mobile"]);
    expect(toInsert).toEqual([]);
  });
});

describe("viewportKindOf", () => {
  it("uses the preset id when the width matches a preset", () => {
    expect(viewportKindOf(desktop)).toBe("desktop");
    expect(viewportKindOf(viewport({ id: "vp-tablet", width: 768 }))).toBe("tablet");
    expect(viewportKindOf(mobile)).toBe("mobile");
  });

  it("classifies non-preset widths by size: >=1024 desktop, >=600 tablet, else mobile", () => {
    expect(viewportKindOf(legacy)).toBe("desktop");
    expect(viewportKindOf(viewport({ id: "vp-c1", width: 1024 }))).toBe("desktop");
    expect(viewportKindOf(viewport({ id: "vp-c2", width: 800 }))).toBe("tablet");
    expect(viewportKindOf(viewport({ id: "vp-c3", width: 600 }))).toBe("tablet");
    expect(viewportKindOf(viewport({ id: "vp-c4", width: 390 }))).toBe("mobile");
  });
});
