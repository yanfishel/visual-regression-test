import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { compare } from "odiff-bin";
import sharp, { type Channels } from "sharp";
import type { Rect, Region, RegionEntry, RegionReport } from "@vrt/shared";

export type AlignedRegion =
  | { kind: "pair"; baseline: Region; current: Region }
  | { kind: "removed"; baseline: Region }
  | { kind: "added"; current: Region };

// Longest common subsequence over the two key sequences (both already in
// y-then-x order from the scan). Duplicate keys - ten `section`s without
// ids - are resolved by position, the way a text diff resolves repeated
// lines. A block that changed its place in the sequence comes out as
// removed + added on purpose: order is part of the layout, and a true
// "moved across" needs pixel comparison between every candidate pair.
export function alignRegions(baseline: Region[], current: Region[]): AlignedRegion[] {
  const n = baseline.length;
  const m = current.length;
  // lcs[i][j] = length of the LCS of baseline[i..] and current[j..]
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] =
        baseline[i]!.key === current[j]!.key
          ? lcs[i + 1]![j + 1]! + 1
          : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const aligned: AlignedRegion[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    const b = baseline[i]!;
    const c = current[j]!;
    if (b.key === c.key) {
      aligned.push({ kind: "pair", baseline: b, current: c });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      aligned.push({ kind: "removed", baseline: b });
      i++;
    } else {
      aligned.push({ kind: "added", current: c });
      j++;
    }
  }
  for (; i < n; i++) aligned.push({ kind: "removed", baseline: baseline[i]! });
  for (; j < m; j++) aligned.push({ kind: "added", current: current[j]! });
  return aligned;
}

const rectOf = (region: Region): Rect => ({
  x: region.x,
  y: region.y,
  width: region.width,
  height: region.height,
});

interface RawImage {
  data: Buffer;
  width: number;
  height: number;
  channels: Channels;
}

// Decodes a captured PNG/WebP to raw pixels once. Reused per side across
// every region so an N-region shot pays libvips one full decode, not N.
// `depth: "uchar"` pins 8-bit output - Chromium never emits a 16-bit PNG,
// but the guard is free and keeps a future source from decoding at double
// the expected byte width per pixel.
const decode = async (image: Buffer): Promise<RawImage> => {
  const { data, info } = await sharp(image).raw({ depth: "uchar" }).toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
};

// Each matched pair is cropped out of its own image at its own rect and
// run through the very same odiff call the verdict uses (antialiasing on,
// no failOnLayoutDiff - the crops are equal by construction), against the
// same threshold. That is what lets "unchanged" here and "passed" overall
// mean one thing (CLAUDE.md §6). A region that changed its size is
// `resized` without a pixel comparison; one whose pixels match but whose
// position differs is `moved` - the false positive the report exists for.
//
// `identicalImages` lets a pair whose rects are identical on both sides
// skip odiff and sharp entirely, on `{ status: "unchanged", diffScore: 0 }`.
// The caller sets it from equal content-addressed storage keys (CLAUDE.md
// §7): equal keys only prove the two *encoded* buffers are byte-identical.
// That is enough to conclude equal *pixels* for whatever buffers are
// actually passed in here only because every encode on the §7 path is
// lossless (`webp({ lossless: true })` or `png()`) - a lossless
// encode/decode round-trip cannot change a pixel, so byte-identical
// encoded output implies pixel-identical source input. If a lossy encode
// is ever added to that path, this flag would start short-circuiting on
// visually different pixels with nothing here to catch it. A pair whose
// rect moved is still compared even when the images are identical - that
// is exactly the "moved" case the report exists to catch, and no
// information is lost.
export async function compareRegions(
  baselineImage: Buffer,
  currentImage: Buffer,
  aligned: AlignedRegion[],
  maxDiffPercentage: number,
  runCompare: typeof compare = compare,
  identicalImages = false,
): Promise<RegionReport> {
  const dir = await mkdtemp(path.join(tmpdir(), "vrt-regions-"));
  // Decoded lazily and at most once per side: a fully short-circuited
  // report (every pair skipped) decodes nothing at all, and a partial one
  // pays for one decode per side instead of one per region per side.
  // Worst case (a >16383px PNG-fallback shot, §7): ~78 MB raw per side,
  // both held for the loop's duration - fine under `concurrency: 1` (§5.9).
  let baselineRaw: RawImage | null = null;
  let currentRaw: RawImage | null = null;
  try {
    const entries: RegionEntry[] = [];
    for (const [index, item] of aligned.entries()) {
      if (item.kind === "removed") {
        const { key, label } = item.baseline;
        entries.push({
          key,
          label,
          status: "removed",
          baseline: rectOf(item.baseline),
          current: null,
          diffScore: null,
        });
        continue;
      }
      if (item.kind === "added") {
        const { key, label } = item.current;
        entries.push({
          key,
          label,
          status: "added",
          baseline: null,
          current: rectOf(item.current),
          diffScore: null,
        });
        continue;
      }

      const { baseline, current } = item;
      const base = {
        key: current.key,
        label: current.label,
        baseline: rectOf(baseline),
        current: rectOf(current),
      };
      if (baseline.width !== current.width || baseline.height !== current.height) {
        entries.push({ ...base, status: "resized", diffScore: null });
        continue;
      }

      const samePlace = baseline.x === current.x && baseline.y === current.y;
      if (identicalImages && samePlace) {
        entries.push({ ...base, status: "unchanged", diffScore: 0 });
        continue;
      }

      const baselinePath = path.join(dir, `${index}-baseline.png`);
      const currentPath = path.join(dir, `${index}-current.png`);
      const diffPath = path.join(dir, `${index}-diff.png`);
      baselineRaw ??= await decode(baselineImage);
      currentRaw ??= await decode(currentImage);
      await sharp(baselineRaw.data, {
        raw: { width: baselineRaw.width, height: baselineRaw.height, channels: baselineRaw.channels },
      })
        .extract({ left: baseline.x, top: baseline.y, width: baseline.width, height: baseline.height })
        .png()
        .toFile(baselinePath);
      await sharp(currentRaw.data, {
        raw: { width: currentRaw.width, height: currentRaw.height, channels: currentRaw.channels },
      })
        .extract({ left: current.x, top: current.y, width: current.width, height: current.height })
        .png()
        .toFile(currentPath);

      const result = await runCompare(baselinePath, currentPath, diffPath, { antialiasing: true });
      if (!result.match && result.reason !== "pixel-diff") {
        throw new Error(`Unexpected odiff result comparing region ${current.key}: ${result.reason}`);
      }
      const diffScore = result.match ? 0 : result.diffPercentage;
      const samePixels = diffScore <= maxDiffPercentage;
      entries.push({
        ...base,
        status: samePixels ? (samePlace ? "unchanged" : "moved") : "changed",
        diffScore,
      });
    }
    return { entries };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export interface RegionReportInput {
  shotId: string;
  baselineRegions: Region[] | null;
  currentRegions: Region[] | null;
  baselineImage: Buffer;
  currentImage: Buffer;
  maxDiffPercentage: number;
  // True when `baselineImage` and `currentImage` are known pixel-identical
  // so identically-placed pairs can skip pixel work entirely. In practice
  // the caller derives this from equal content-addressed storage keys
  // (CLAUDE.md §7): equal keys prove the two *encoded* buffers are
  // byte-identical, which only implies pixel-identical source buffers
  // because every encode on that path is lossless - see the invariant
  // note on `compareRegions`. Defaults to false (always compare).
  identicalImages?: boolean;
}

// The one entry point the run processor calls. Never throws: the report
// is a by-product of the comparison, and a failure in it must neither
// fail the run nor touch the verdict - it is logged and the row gets
// region_report NULL. All-or-nothing on purpose: a partial report would
// read as "everything else is unchanged".
export async function regionReportFor(
  input: RegionReportInput,
  runCompare: typeof compare = compare,
): Promise<RegionReport | null> {
  if (!input.baselineRegions || !input.currentRegions) {
    return null;
  }
  try {
    const aligned = alignRegions(input.baselineRegions, input.currentRegions);
    return await compareRegions(
      input.baselineImage,
      input.currentImage,
      aligned,
      input.maxDiffPercentage,
      runCompare,
      input.identicalImages ?? false,
    );
  } catch (error) {
    console.error(
      `Region report for shot ${input.shotId} failed:`,
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}
