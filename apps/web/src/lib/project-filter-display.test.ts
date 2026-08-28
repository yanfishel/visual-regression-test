import { describe, expect, it } from "vitest";
import { PROJECT_FILTERS } from "./project-filters.js";
import { PROJECT_FILTER_DOT_CLASS, PROJECT_FILTER_LABEL } from "./project-filter-display.js";

describe("project filter display maps", () => {
  it("labels the no-filter entry and every outcome", () => {
    expect(PROJECT_FILTER_LABEL.all).toBe("All projects");
    expect(PROJECT_FILTER_LABEL.passing).toBe("Passing");
    expect(PROJECT_FILTER_LABEL.failing).toBe("Failing");
    expect(PROJECT_FILTER_LABEL["no-runs"]).toBe("No runs");
  });

  it("gives each outcome its own colour", () => {
    expect(PROJECT_FILTER_DOT_CLASS.passing).toContain("success");
    expect(PROJECT_FILTER_DOT_CLASS.failing).toContain("danger");
    expect(PROJECT_FILTER_DOT_CLASS["no-runs"]).not.toBe(PROJECT_FILTER_DOT_CLASS.passing);
  });

  // An outcome added to PROJECT_FILTERS without an entry here would render an
  // unlabelled, unstyled option - easy to miss by eye, never by this test.
  it("covers every filter value plus the all entry", () => {
    for (const filter of [...PROJECT_FILTERS, "all"] as const) {
      expect(PROJECT_FILTER_LABEL[filter]).toBeTruthy();
      expect(PROJECT_FILTER_DOT_CLASS[filter]).toBeTruthy();
    }
  });
});
