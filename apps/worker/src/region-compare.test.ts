import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { Region } from "@vrt/shared";
import type { compare } from "odiff-bin";
import { alignRegions, compareRegions, regionReportFor } from "./region-compare.js";

function region(key: string, y = 0): Region {
  return { key, label: key, x: 0, y, width: 100, height: 50 };
}
const kinds = (aligned: ReturnType<typeof alignRegions>) =>
  aligned.map((item) =>
    item.kind === "pair"
      ? `=${item.current.key}`
      : item.kind === "added"
        ? `+${item.current.key}`
        : `-${item.baseline.key}`,
  );

describe("alignRegions", () => {
  it("pairs identical sequences one to one", () => {
    const regions = [region("header"), region("section", 80), region("footer", 160)];
    expect(kinds(alignRegions(regions, regions))).toEqual(["=header", "=section", "=footer"]);
  });

  it("reports an inserted block as added and a missing one as removed, in place", () => {
    const baseline = [region("header"), region("section#a", 80), region("footer", 160)];
    const current = [
      region("header"),
      region("div[banner]", 80),
      region("section#a", 120),
      region("footer", 200),
    ];
    expect(kinds(alignRegions(baseline, current))).toEqual([
      "=header",
      "+div[banner]",
      "=section#a",
      "=footer",
    ]);
    expect(kinds(alignRegions(current, baseline))).toEqual([
      "=header",
      "-div[banner]",
      "=section#a",
      "=footer",
    ]);
  });

  it("resolves duplicate keys by sequence position", () => {
    const baseline = [region("section"), region("section", 50), region("section", 100)];
    const current = [region("section"), region("section", 50)];
    expect(kinds(alignRegions(baseline, current))).toEqual(["=section", "=section", "-section"]);
  });

  it("reports a reordered block as removed plus added - order is part of the layout", () => {
    const baseline = [region("section#a"), region("section#b", 50), region("section#c", 100)];
    const current = [region("section#b"), region("section#c", 50), region("section#a", 100)];
    expect(kinds(alignRegions(baseline, current))).toEqual([
      "-section#a",
      "=section#b",
      "=section#c",
      "+section#a",
    ]);
  });

  it("handles empty sides", () => {
    expect(alignRegions([], [])).toEqual([]);
    expect(kinds(alignRegions([], [region("nav")]))).toEqual(["+nav"]);
    expect(kinds(alignRegions([region("nav")], []))).toEqual(["-nav"]);
  });
});

// A 200×200 image with one solid square on a white ground.
async function imageWithSquare(square: {
  x: number;
  y: number;
  size: number;
  color: string;
}): Promise<Buffer> {
  return sharp({ create: { width: 200, height: 200, channels: 3, background: "#fff" } })
    .composite([
      {
        input: await sharp({
          create: { width: square.size, height: square.size, channels: 3, background: square.color },
        })
          .png()
          .toBuffer(),
        left: square.x,
        top: square.y,
      },
    ])
    .png()
    .toBuffer();
}
const rect = (x: number, y: number, size = 50) => ({ x, y, width: size, height: size });
const named = (key: string, r: ReturnType<typeof rect>): Region => ({ key, label: key, ...r });

describe("compareRegions", () => {
  it("classifies pairs as unchanged, moved, changed and resized, and passes added/removed through", async () => {
    const baseline = await imageWithSquare({ x: 10, y: 10, size: 50, color: "#f00" });
    // Same red square, 40px lower: the block moved.
    const current = await imageWithSquare({ x: 10, y: 50, size: 50, color: "#f00" });

    const report = await compareRegions(
      baseline,
      current,
      [
        // Same pixels (white), same place.
        { kind: "pair", baseline: named("footer", rect(100, 140)), current: named("footer", rect(100, 140)) },
        // Same pixels (the red square), different y.
        {
          kind: "pair",
          baseline: named("section#hero", rect(10, 10)),
          current: named("section#hero", rect(10, 50)),
        },
        // Red square in the baseline crop vs white in the current crop.
        { kind: "pair", baseline: named("nav", rect(10, 10)), current: named("nav", rect(100, 100)) },
        { kind: "pair", baseline: named("aside", rect(0, 0, 40)), current: named("aside", rect(0, 0, 60)) },
        { kind: "added", current: named("div[banner]", rect(0, 150)) },
        { kind: "removed", baseline: named("form", rect(0, 150)) },
      ],
      1,
    );

    expect(report.entries.map((entry) => [entry.key, entry.status])).toEqual([
      ["footer", "unchanged"],
      ["section#hero", "moved"],
      ["nav", "changed"],
      ["aside", "resized"],
      ["div[banner]", "added"],
      ["form", "removed"],
    ]);
    expect(report.entries[0]).toEqual({
      key: "footer",
      label: "footer",
      status: "unchanged",
      baseline: rect(100, 140),
      current: rect(100, 140),
      diffScore: 0,
    });
    expect(report.entries[2]?.diffScore).toBeGreaterThan(1);
    expect(report.entries[3]?.diffScore).toBeNull();
    expect(report.entries[4]).toMatchObject({ baseline: null, current: rect(0, 150), diffScore: null });
    expect(report.entries[5]).toMatchObject({ baseline: rect(0, 150), current: null, diffScore: null });
  });

  it("applies the project threshold the same way the verdict does", async () => {
    // A 10×10 block, not a 2×2 one: odiff's antialiasing detection can
    // discount the pixels of a block that is all edge.
    const baseline = await imageWithSquare({ x: 0, y: 0, size: 10, color: "#000" });
    const current = await imageWithSquare({ x: 0, y: 0, size: 10, color: "#fff" });
    const pair = {
      kind: "pair" as const,
      baseline: named("section", rect(0, 0, 100)),
      current: named("section", rect(0, 0, 100)),
    };

    // 100 of 10 000 pixels differ = 1%.
    const strict = await compareRegions(baseline, current, [pair], 0.1);
    const lenient = await compareRegions(baseline, current, [pair], 5);
    expect(strict.entries[0]?.status).toBe("changed");
    expect(lenient.entries[0]?.status).toBe("unchanged");
  });

  it("throws on an odiff result it cannot classify - the caller turns that into a null report", async () => {
    const image = await imageWithSquare({ x: 0, y: 0, size: 1, color: "#fff" });
    const runCompare = (async () => ({ match: false, reason: "layout-diff" })) as unknown as typeof compare;
    await expect(
      compareRegions(
        image,
        image,
        [{ kind: "pair", baseline: named("nav", rect(0, 0)), current: named("nav", rect(0, 0)) }],
        1,
        runCompare,
      ),
    ).rejects.toThrow(/layout-diff/);
  });

  it("skips odiff and sharp entirely for identically-placed pairs of identical images", async () => {
    const image = await imageWithSquare({ x: 10, y: 10, size: 50, color: "#f00" });
    const aligned = [
      { kind: "pair" as const, baseline: named("header", rect(0, 0)), current: named("header", rect(0, 0)) },
      { kind: "pair" as const, baseline: named("nav", rect(0, 60)), current: named("nav", rect(0, 60)) },
      {
        kind: "pair" as const,
        baseline: named("footer", rect(0, 120)),
        current: named("footer", rect(0, 120)),
      },
    ];
    const runCompare = vi.fn();

    const report = await compareRegions(
      image,
      image,
      aligned,
      1,
      runCompare as unknown as typeof compare,
      true,
    );

    expect(report.entries).toEqual([
      {
        key: "header",
        label: "header",
        status: "unchanged",
        baseline: rect(0, 0),
        current: rect(0, 0),
        diffScore: 0,
      },
      {
        key: "nav",
        label: "nav",
        status: "unchanged",
        baseline: rect(0, 60),
        current: rect(0, 60),
        diffScore: 0,
      },
      {
        key: "footer",
        label: "footer",
        status: "unchanged",
        baseline: rect(0, 120),
        current: rect(0, 120),
        diffScore: 0,
      },
    ]);
    expect(runCompare).not.toHaveBeenCalled();
  });

  it("still compares a pair whose rects moved even when the images are identical", async () => {
    const image = await imageWithSquare({ x: 10, y: 10, size: 50, color: "#f00" });
    const aligned = [
      { kind: "pair" as const, baseline: named("header", rect(0, 0)), current: named("header", rect(0, 0)) },
      // Same image both sides, but the current rect moved - not skippable.
      { kind: "pair" as const, baseline: named("nav", rect(0, 60)), current: named("nav", rect(20, 60)) },
    ];
    const runCompare = vi.fn(async () => ({ match: true }));

    const report = await compareRegions(
      image,
      image,
      aligned,
      1,
      runCompare as unknown as typeof compare,
      true,
    );

    expect(report.entries[0]).toMatchObject({ key: "header", status: "unchanged", diffScore: 0 });
    expect(report.entries[1]).toMatchObject({ key: "nav", status: "moved", diffScore: 0 });
    expect(runCompare).toHaveBeenCalledTimes(1);
  });
});

describe("regionReportFor", () => {
  const input = async () => {
    const image = await imageWithSquare({ x: 0, y: 0, size: 1, color: "#fff" });
    return { shotId: "shot-1", baselineImage: image, currentImage: image, maxDiffPercentage: 1 };
  };

  it("returns null when either side has no regions", async () => {
    const base = await input();
    expect(
      await regionReportFor({ ...base, baselineRegions: null, currentRegions: [named("nav", rect(0, 0))] }),
    ).toBeNull();
    expect(
      await regionReportFor({ ...base, baselineRegions: [named("nav", rect(0, 0))], currentRegions: null }),
    ).toBeNull();
  });

  it("returns the report when both sides have regions", async () => {
    const base = await input();
    const report = await regionReportFor({
      ...base,
      baselineRegions: [named("nav", rect(0, 0))],
      currentRegions: [named("nav", rect(0, 0))],
    });
    expect(report?.entries.map((entry) => entry.status)).toEqual(["unchanged"]);
  });

  it("returns null instead of throwing when the comparison fails", async () => {
    const base = await input();
    const runCompare = (async () => {
      throw new Error("odiff exploded");
    }) as unknown as typeof compare;
    const report = await regionReportFor(
      { ...base, baselineRegions: [named("nav", rect(0, 0))], currentRegions: [named("nav", rect(0, 0))] },
      runCompare,
    );
    expect(report).toBeNull();
  });
});
