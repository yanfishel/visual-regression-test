import { describe, expect, it } from "vitest";
import { buildRunSlides } from "./run-slides.js";

const pageRows = [
  { id: "p-home", label: "Home" },
  { id: "p-about", label: "About" },
];
const viewportRows = [
  { id: "v-desktop", label: "Desktop", width: 1200 },
  { id: "v-tablet", label: "Tablet", width: 768 },
  { id: "v-mobile", label: "Mobile", width: 375 },
];

describe("buildRunSlides", () => {
  it("orders slides like the run grid: page label, viewport widest first, then shot id", () => {
    const slides = buildRunSlides(
      [
        { id: "s3", storageKey: "k3", pageId: "p-home", viewportId: "v-mobile" },
        { id: "s4", storageKey: "k4", pageId: "p-home", viewportId: "v-tablet" },
        { id: "s2", storageKey: "k2", pageId: "p-home", viewportId: "v-desktop" },
        { id: "s1", storageKey: "k1", pageId: "p-about", viewportId: "v-desktop" },
      ],
      pageRows,
      viewportRows,
    );

    // Tablet (768) sits between Desktop and Mobile by width, although "Mobile"
    // sorts before "Tablet" alphabetically - the grid order is by width.
    expect(slides).toEqual([
      { shotId: "s1", storageKey: "k1", pageLabel: "About", viewportLabel: "Desktop" },
      { shotId: "s2", storageKey: "k2", pageLabel: "Home", viewportLabel: "Desktop" },
      { shotId: "s4", storageKey: "k4", pageLabel: "Home", viewportLabel: "Tablet" },
      { shotId: "s3", storageKey: "k3", pageLabel: "Home", viewportLabel: "Mobile" },
    ]);
  });

  it("breaks equal-label ties by shot id", () => {
    const slides = buildRunSlides(
      [
        { id: "s2", storageKey: "k2", pageId: "p-home", viewportId: "v-desktop" },
        { id: "s1", storageKey: "k1", pageId: "p-home", viewportId: "v-desktop" },
      ],
      pageRows,
      viewportRows,
    );

    expect(slides.map((slide) => slide.shotId)).toEqual(["s1", "s2"]);
  });

  it("falls back to empty labels for unknown page or viewport ids", () => {
    const slides = buildRunSlides(
      [{ id: "s1", storageKey: "k1", pageId: "gone", viewportId: "gone" }],
      pageRows,
      viewportRows,
    );

    expect(slides).toEqual([{ shotId: "s1", storageKey: "k1", pageLabel: "", viewportLabel: "" }]);
  });

  it("returns no slides for a run with no shots", () => {
    expect(buildRunSlides([], pageRows, viewportRows)).toEqual([]);
  });
});
