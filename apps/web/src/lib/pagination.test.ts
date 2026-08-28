import { describe, expect, it } from "vitest";
import { paginate, parsePage } from "./pagination.js";

describe("paginate", () => {
  const items = ["a", "b", "c", "d", "e", "f", "g"];

  it("slices the requested page", () => {
    expect(paginate(items, 2, 3)).toEqual({ items: ["d", "e", "f"], page: 2, pageCount: 3 });
  });

  it("clamps a page beyond the end to the last page", () => {
    expect(paginate(items, 99, 3)).toEqual({ items: ["g"], page: 3, pageCount: 3 });
  });

  it("clamps a page below one to the first page", () => {
    expect(paginate(items, 0, 3).page).toBe(1);
  });

  it("handles an empty list as a single empty page", () => {
    expect(paginate([], 5, 3)).toEqual({ items: [], page: 1, pageCount: 1 });
  });
});

describe("parsePage", () => {
  it("parses the page number defensively", () => {
    expect(parsePage("2")).toBe(2);
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("-3")).toBe(1);
    expect(parsePage("abc")).toBe(1);
    expect(parsePage(["2"])).toBe(1);
  });
});
