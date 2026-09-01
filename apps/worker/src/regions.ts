import type { Page } from "playwright";
import sharp from "sharp";
import type { Region } from "@vrt/shared";
import { withDeadline } from "./deadline.js";

// A region as the in-page scan reports it: screenshot pixels already
// (CSS px × deviceScaleFactor) but unrounded and not yet clipped to the
// image, whose size is only known after the screenshot.
export interface RawRegion {
  key: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// Every rect that leaves here lies inside the image, so sharp.extract on
// it downstream cannot throw. Rounding happens on the edges, not on the
// size, so two regions that share an edge in the DOM still share it here.
export function clipRegions(regions: RawRegion[], imageWidth: number, imageHeight: number): Region[] {
  const clipped: Region[] = [];
  for (const region of regions) {
    const left = Math.max(0, Math.round(region.x));
    const top = Math.max(0, Math.round(region.y));
    const right = Math.min(imageWidth, Math.round(region.x + region.width));
    const bottom = Math.min(imageHeight, Math.round(region.y + region.height));
    if (right - left <= 0 || bottom - top <= 0) {
      continue;
    }
    clipped.push({
      key: region.key,
      label: region.label,
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    });
  }
  return clipped;
}

const REGION_SCAN_TIMEOUT_MS = 5_000;

// Runs INSIDE the page through page.evaluate, so it must be self-contained:
// no imports, no references to module-level values - Playwright serialises
// the function's source, not its closure. Returns the page's top-level
// blocks in screenshot pixels, unrounded and unclipped (clipRegions does
// that once the image size is known).
//
// The heuristic (CLAUDE.md section 6 "Region report"):
// - a "significant" element is visible and at least 32×64 CSS px;
// - a node with two or more significant children is split into them,
//   unless it is a semantic unit (header/nav/section/... or a landmark
//   role), which stays whole; `main` and single-child wrappers are always
//   descended through;
// - breadth-first, at most 40 regions: a level that would exceed the cap is
//   not taken, so the walk stops at the coarser level.
export function segmentPage(deviceScaleFactor: number): RawRegion[] {
  const MIN_HEIGHT = 32;
  const MIN_WIDTH = 64;
  const MAX_REGIONS = 40;
  const MAX_DEPTH = 6;
  const LABEL_MAX = 60;
  const UNIT_TAGS = ["header", "nav", "section", "article", "aside", "footer", "form", "svg"];
  const UNIT_ROLES = ["banner", "navigation", "region", "article", "complementary", "contentinfo", "form"];
  const SKIP_TAGS = ["script", "style", "template", "noscript"];

  const tagOf = (element: Element): string => element.tagName.toLowerCase();
  const roleOf = (element: Element): string | null =>
    element.getAttribute("role")?.trim().toLowerCase() || null;
  const isMain = (element: Element): boolean => tagOf(element) === "main" || roleOf(element) === "main";
  const isUnit = (element: Element): boolean => {
    const role = roleOf(element);
    return UNIT_TAGS.includes(tagOf(element)) || (role !== null && UNIT_ROLES.includes(role));
  };

  const significantChildren = (element: Element): Element[] => {
    const result: Element[] = [];
    for (const child of Array.from(element.children)) {
      // HTML elements and a root <svg>; never MathML or the insides of an
      // svg (those are SVGElements, reached only if an svg were split -
      // it never is, "svg" is a unit tag).
      if (!(child instanceof HTMLElement) && tagOf(child) !== "svg") continue;
      if (SKIP_TAGS.includes(tagOf(child))) continue;
      const style = getComputedStyle(child);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const rect = child.getBoundingClientRect();
      if (rect.height < MIN_HEIGHT || rect.width < MIN_WIDTH) continue;
      result.push(child);
    }
    return result;
  };

  let level: Element[] = [document.body];
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    const next: Element[] = [];
    let descended = false;
    for (const element of level) {
      const children = significantChildren(element);
      if (children.length === 0) {
        next.push(element);
      } else if (children.length === 1) {
        // A wrapper: the one child is the block, whatever the wrapper is.
        next.push(children[0]!);
        descended = true;
      } else if (element !== document.body && !isMain(element) && isUnit(element)) {
        next.push(element);
      } else {
        next.push(...children);
        descended = true;
      }
    }
    if (!descended) break;
    if (next.length > MAX_REGIONS) break;
    level = next;
  }

  // body never is a region of its own: an empty page has no regions.
  const elements = level.filter((element) => element !== document.body);

  const keyOf = (element: Element): string => {
    const tag = tagOf(element);
    const id = element.id.trim();
    if (id) return `${tag}#${id}`;
    const role = roleOf(element);
    return role ? `${tag}[${role}]` : tag;
  };
  const labelOf = (element: Element, key: string): string => {
    const heading = element.matches("h1,h2,h3,h4,h5,h6")
      ? element
      : element.querySelector("h1,h2,h3,h4,h5,h6");
    const text = (heading?.textContent ?? element.getAttribute("aria-label") ?? "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) return key;
    const cut = text.length > LABEL_MAX ? `${text.slice(0, LABEL_MAX - 1)}…` : text;
    return `${key} › "${cut}"`;
  };

  const regions: RawRegion[] = elements.map((element) => {
    const rect = element.getBoundingClientRect();
    const key = keyOf(element);
    return {
      key,
      label: labelOf(element, key),
      x: (rect.left + window.scrollX) * deviceScaleFactor,
      y: (rect.top + window.scrollY) * deviceScaleFactor,
      width: rect.width * deviceScaleFactor,
      height: rect.height * deviceScaleFactor,
    };
  });
  regions.sort((a, b) => a.y - b.y || a.x - b.x);
  return regions;
}

// The scan is a by-product of the capture (like the favicon): anything
// going wrong - a CSP that blocks evaluate, a page that closed, a hang -
// logs once and yields null, and the screenshot is taken regardless.
export async function collectRegions(
  page: Page,
  deviceScaleFactor: number,
  label: string,
): Promise<RawRegion[] | null> {
  try {
    const scan = (async () => {
      // tsx/esbuild (keep-names) wraps the functions inside segmentPage in its
      // `__name(fn, "name")` helper; Playwright ships the function's *source*
      // to the page, where no such helper exists. vitest's transform doesn't
      // inject it, which is why the browser test never saw this. Defining it
      // as identity first makes the scan independent of who transpiled it;
      // the trailing `; 0` keeps the evaluated result serialisable across
      // Playwright versions (without it, the expression evaluates to the
      // assigned function, which Playwright would then have to serialise).
      await page.evaluate("globalThis.__name ??= (fn) => fn; 0");
      return page.evaluate(segmentPage, deviceScaleFactor);
    })();
    const raw = await withDeadline(scan, REGION_SCAN_TIMEOUT_MS, `Region scan of ${label}`);
    if (!Array.isArray(raw)) {
      throw new Error("scan returned no list");
    }
    return raw;
  } catch (error) {
    console.error(`Region scan failed for ${label}:`, error instanceof Error ? error.message : String(error));
    return null;
  }
}

// The second half of the scan, once the screenshot exists: its pixel size
// is what the rects are clipped to. Same failure contract as collectRegions
// (log once, yield null), but a distinct log message ("clip" vs "scan") so
// a sharp/metadata failure here is distinguishable in worker logs from an
// evaluate failure in collectRegions.
export async function clipRegionsToImage(
  regions: RawRegion[],
  pngBuffer: Buffer,
  label: string,
): Promise<Region[] | null> {
  try {
    const { width, height } = await sharp(pngBuffer).metadata();
    if (!width || !height) {
      throw new Error("screenshot has no dimensions");
    }
    return clipRegions(regions, width, height);
  } catch (error) {
    console.error(`Region clip failed for ${label}:`, error instanceof Error ? error.message : String(error));
    return null;
  }
}
