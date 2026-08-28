import { describe, expect, it } from "vitest";
import {
  describeMissingProjectRequirements,
  incompleteProjectSections,
  missingProjectRequirements,
} from "./project-dialog-requirements.js";

const COMPLETE = { name: "My Project", baseUrl: "https://example.com", presetCount: 1, filledPageCount: 1 };

describe("missingProjectRequirements", () => {
  it("lists nothing once every requirement is met", () => {
    expect(missingProjectRequirements(COMPLETE)).toEqual([]);
  });

  it("lists all four, in dialog field order, on an untouched draft", () => {
    expect(missingProjectRequirements({ name: "", baseUrl: "", presetCount: 0, filledPageCount: 0 })).toEqual(
      ["a name", "a base URL", "at least one viewport", "at least one page with a label and a path"],
    );
  });

  it("treats whitespace-only text the same as empty", () => {
    expect(missingProjectRequirements({ ...COMPLETE, name: "   " })).toEqual(["a name"]);
  });

  it("still asks for a page when a row is only half filled", () => {
    // filledPageCount counts only rows with both a label and a path
    // (isPageDraftFilled) - a label-only row must not count as a page.
    expect(missingProjectRequirements({ ...COMPLETE, filledPageCount: 0 })).toEqual([
      "at least one page with a label and a path",
    ]);
  });

  it("asks only for a viewport when every preset is deselected", () => {
    // The original bug report: a project whose only viewport row didn't
    // match a preset had presetCount 0 with everything else filled, and
    // nothing on screen said why Save was dead.
    expect(missingProjectRequirements({ ...COMPLETE, presetCount: 0 })).toEqual(["at least one viewport"]);
  });
});

describe("describeMissingProjectRequirements", () => {
  it("returns null once the form is complete", () => {
    expect(describeMissingProjectRequirements(COMPLETE)).toBeNull();
  });

  it("phrases a single missing item", () => {
    expect(describeMissingProjectRequirements({ ...COMPLETE, name: "" })).toBe("Still needed: a name.");
  });

  it("phrases two missing items with 'and', no Oxford comma", () => {
    expect(describeMissingProjectRequirements({ ...COMPLETE, name: "", baseUrl: "" })).toBe(
      "Still needed: a name and a base URL.",
    );
  });

  it("phrases all four missing items as a comma list ending in 'and'", () => {
    expect(
      describeMissingProjectRequirements({ name: "", baseUrl: "", presetCount: 0, filledPageCount: 0 }),
    ).toBe(
      "Still needed: a name, a base URL, at least one viewport and at least one page with a label and a path.",
    );
  });
});

describe("incompleteProjectSections", () => {
  it("marks nothing on a complete draft", () => {
    expect(incompleteProjectSections(COMPLETE)).toEqual({ general: false, pages: false });
  });

  it("marks General when the name, URL or viewports are missing", () => {
    expect(incompleteProjectSections({ ...COMPLETE, name: " " }).general).toBe(true);
    expect(incompleteProjectSections({ ...COMPLETE, baseUrl: "" }).general).toBe(true);
    expect(incompleteProjectSections({ ...COMPLETE, presetCount: 0 }).general).toBe(true);
    expect(incompleteProjectSections({ ...COMPLETE, presetCount: 0 }).pages).toBe(false);
  });

  it("marks Pages only for the page requirement", () => {
    expect(incompleteProjectSections({ ...COMPLETE, filledPageCount: 0 })).toEqual({
      general: false,
      pages: true,
    });
  });
});
