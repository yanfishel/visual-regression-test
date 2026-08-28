import { describe, expect, it } from "vitest";
import { compareGridOrder, type GridEntry } from "./grid-order.js";

interface Entry extends GridEntry {
  id: string;
}

const home = { id: "p-home", label: "Home" };
const about = { id: "p-about", label: "About" };
const desktop = { label: "Desktop", width: 1200 };
const tablet = { label: "Tablet", width: 768 };
const mobile = { label: "Mobile", width: 375 };

function sorted(entries: Entry[]): string[] {
  return [...entries].sort((a, b) => compareGridOrder(a, b, (entry) => entry.id)).map((entry) => entry.id);
}

describe("compareGridOrder", () => {
  it("orders by page label, then viewport width (widest first), then id", () => {
    expect(
      sorted([
        { id: "home-mobile", page: home, viewport: mobile },
        { id: "home-tablet", page: home, viewport: tablet },
        { id: "about-desktop", page: about, viewport: desktop },
        { id: "home-desktop", page: home, viewport: desktop },
      ]),
    ).toEqual(["about-desktop", "home-desktop", "home-tablet", "home-mobile"]);
  });

  it("keeps two equal-label pages apart by id and breaks full ties by the entry id", () => {
    const home2 = { id: "p-home-2", label: "Home" };
    expect(
      sorted([
        { id: "b", page: home2, viewport: desktop },
        { id: "d", page: home, viewport: desktop },
        { id: "c", page: home, viewport: desktop },
        { id: "a", page: home2, viewport: desktop },
      ]),
    ).toEqual(["c", "d", "a", "b"]);
  });

  it("sorts entries with a missing page or viewport last", () => {
    expect(
      sorted([
        { id: "no-page", viewport: desktop },
        { id: "no-viewport", page: home },
        { id: "full", page: home, viewport: desktop },
      ]),
    ).toEqual(["full", "no-viewport", "no-page"]);
  });
});
