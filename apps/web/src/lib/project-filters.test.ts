import { describe, expect, it } from "vitest";
import type { Project, Run } from "@vrt/db";
import type { ProjectCardData } from "./project-cards.js";
import { classifyProjectOutcome, filterProjects, parseProjectFilter } from "./project-filters.js";

function card(overrides: Partial<ProjectCardData>): ProjectCardData {
  return {
    pages: [],
    viewports: [],
    schedule: null,
    lastRun: null,
    lastFinishedRun: null,
    lastResult: null,
    previewStorageKey: null,
    ...overrides,
  };
}

function project(id: string, name: string, baseUrl: string): Project {
  return { id, name, baseUrl } as Project;
}

describe("classifyProjectOutcome", () => {
  it("classifies a project without finished runs as no-runs", () => {
    expect(classifyProjectOutcome(card({}))).toBe("no-runs");
    expect(classifyProjectOutcome(card({ lastRun: { status: "queued" } as Run }))).toBe("no-runs");
  });

  it("classifies a worker-errored run as failing even with zero failed comparisons", () => {
    const data = card({
      lastFinishedRun: { status: "failed" } as Run,
      lastResult: { runId: "r", passed: 0, failed: 0, unreviewed: 0 },
    });
    expect(classifyProjectOutcome(data)).toBe("failing");
  });

  it("classifies failed comparisons as failing", () => {
    const data = card({
      lastFinishedRun: { status: "done" } as Run,
      lastResult: { runId: "r", passed: 3, failed: 1, unreviewed: 0 },
    });
    expect(classifyProjectOutcome(data)).toBe("failing");
  });

  it("classifies a clean finished run as passing, unreviewed comparisons included", () => {
    const data = card({
      lastFinishedRun: { status: "done" } as Run,
      lastResult: { runId: "r", passed: 2, failed: 0, unreviewed: 1 },
    });
    expect(classifyProjectOutcome(data)).toBe("passing");
  });
});

describe("filterProjects", () => {
  const projects = [
    project("p1", "Marketing site", "https://example.com"),
    project("p2", "Docs", "https://docs.example.com"),
    project("p3", "Blog", "https://blog.other.org"),
  ];
  const cards = new Map<string, ProjectCardData>([
    [
      "p1",
      card({
        lastFinishedRun: { status: "done" } as Run,
        lastResult: { runId: "r1", passed: 1, failed: 0, unreviewed: 0 },
      }),
    ],
    [
      "p2",
      card({
        lastFinishedRun: { status: "done" } as Run,
        lastResult: { runId: "r2", passed: 0, failed: 2, unreviewed: 0 },
      }),
    ],
    ["p3", card({})],
  ]);

  it("returns everything when no query and no filter", () => {
    expect(filterProjects(projects, cards, { query: "", filter: null })).toEqual(projects);
  });

  it("matches the query against name and base URL, case-insensitively", () => {
    expect(filterProjects(projects, cards, { query: "MARKET", filter: null }).map((p) => p.id)).toEqual([
      "p1",
    ]);
    expect(filterProjects(projects, cards, { query: "example.com", filter: null }).map((p) => p.id)).toEqual([
      "p1",
      "p2",
    ]);
  });

  it("filters by outcome", () => {
    expect(filterProjects(projects, cards, { query: "", filter: "passing" }).map((p) => p.id)).toEqual([
      "p1",
    ]);
    expect(filterProjects(projects, cards, { query: "", filter: "failing" }).map((p) => p.id)).toEqual([
      "p2",
    ]);
    expect(filterProjects(projects, cards, { query: "", filter: "no-runs" }).map((p) => p.id)).toEqual([
      "p3",
    ]);
  });

  it("combines query and filter", () => {
    expect(filterProjects(projects, cards, { query: "example", filter: "failing" }).map((p) => p.id)).toEqual(
      ["p2"],
    );
  });
});

describe("query-param parsing", () => {
  it("accepts only known filter values", () => {
    expect(parseProjectFilter("passing")).toBe("passing");
    expect(parseProjectFilter("failing")).toBe("failing");
    expect(parseProjectFilter("no-runs")).toBe("no-runs");
    expect(parseProjectFilter("everything")).toBeNull();
    expect(parseProjectFilter(undefined)).toBeNull();
    expect(parseProjectFilter(["passing"])).toBeNull();
  });
});
