import { describe, expect, it } from "vitest";
import type { PageRow } from "@vrt/db";
import { diffPageSelection } from "./page-selection.js";

function page(overrides: Partial<PageRow> & { id: string }): PageRow {
  return {
    projectId: "11111111-1111-4111-8111-111111111111",
    label: "Home",
    path: "/",
    waitSelector: null,
    maskSelectors: [],
    createdAt: new Date(0),
    ...overrides,
  } as PageRow;
}

const home = page({ id: "page-home" });
const docs = page({ id: "page-docs", label: "Docs", path: "/docs" });

function draft(
  overrides: Partial<{
    id: string;
    label: string;
    path: string;
    waitSelector?: string;
    maskSelectors: string[];
  }>,
) {
  return { label: "Home", path: "/", maskSelectors: [], ...overrides };
}

describe("diffPageSelection", () => {
  it("inserts drafts that carry no id", () => {
    const { toInsert, toUpdate, toDeleteIds } = diffPageSelection(
      [home],
      [draft({ id: "page-home" }), draft({ label: "Pricing", path: "/pricing" })],
    );
    expect(toInsert).toHaveLength(1);
    expect(toInsert[0]?.path).toBe("/pricing");
    expect(toUpdate).toEqual([]);
    expect(toDeleteIds).toEqual([]);
  });

  it("updates an existing page in place when a field changed", () => {
    const { toUpdate, toInsert, toDeleteIds } = diffPageSelection(
      [home],
      [draft({ id: "page-home", label: "Landing" })],
    );
    expect(toUpdate).toEqual([
      { id: "page-home", label: "Landing", path: "/", waitSelector: null, maskSelectors: [] },
    ]);
    expect(toInsert).toEqual([]);
    expect(toDeleteIds).toEqual([]);
  });

  it("skips an unchanged page so a no-op save writes nothing", () => {
    const { toInsert, toUpdate, toDeleteIds } = diffPageSelection(
      [home, docs],
      [draft({ id: "page-home" }), draft({ id: "page-docs", label: "Docs", path: "/docs" })],
    );
    expect(toInsert).toEqual([]);
    expect(toUpdate).toEqual([]);
    expect(toDeleteIds).toEqual([]);
  });

  it("treats an empty wait selector as unchanged against a null column", () => {
    const { toUpdate } = diffPageSelection([home], [draft({ id: "page-home", waitSelector: "" })]);
    expect(toUpdate).toEqual([]);
  });

  it("detects a changed mask selector list", () => {
    const { toUpdate } = diffPageSelection([home], [draft({ id: "page-home", maskSelectors: [".avatar"] })]);
    expect(toUpdate).toHaveLength(1);
    expect(toUpdate[0]?.maskSelectors).toEqual([".avatar"]);
  });

  it("deletes existing pages the draft list no longer mentions", () => {
    const { toDeleteIds, toInsert } = diffPageSelection([home, docs], [draft({ id: "page-home" })]);
    expect(toDeleteIds).toEqual(["page-docs"]);
    expect(toInsert).toEqual([]);
  });

  it("deletes and re-inserts when a page is replaced by a new one on the same path", () => {
    const { toInsert, toDeleteIds } = diffPageSelection([docs], [draft({ label: "Docs", path: "/docs" })]);
    expect(toDeleteIds).toEqual(["page-docs"]);
    expect(toInsert).toHaveLength(1);
  });

  it("rejects a draft whose id does not belong to this project", () => {
    expect(() => diffPageSelection([home], [draft({ id: "page-from-another-project" })])).toThrow();
  });
});
