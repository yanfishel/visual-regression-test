import type { Page } from "playwright";
import type { FaviconFormat } from "@vrt/shared";

// The site's favicon, picked up during a run from a page the worker has
// already loaded (so it costs no extra navigation) and stored once as
// projects.favicon_key - the project page shows it beside the base URL. A
// project without one keeps trying on every run (one evaluate plus, at
// most, a few small requests), so a site that adds an icon later gets it.

export interface CapturedFavicon {
  buffer: Buffer;
  format: FaviconFormat;
}

// What a `<link>` in the page declares - href already resolved by the DOM.
export interface IconLink {
  href: string;
  rel: string;
  type: string;
}

// A favicon is a few KB; anything bigger is a mistake (a hero image behind
// rel=icon) and not worth keeping.
const MAX_FAVICON_BYTES = 512 * 1024;
const REQUEST_TIMEOUT_MS = 5000;

const ICON_LINK_SELECTOR =
  'link[rel~="icon"], link[rel~="apple-touch-icon"], link[rel~="apple-touch-icon-precomposed"]';

export async function captureFavicon(page: Page): Promise<CapturedFavicon | null> {
  let links: IconLink[] = [];
  try {
    links = await page.evaluate((selector) => {
      return Array.from(document.querySelectorAll<HTMLLinkElement>(selector)).map((link) => ({
        href: link.href,
        rel: link.rel,
        type: link.getAttribute("type") ?? "",
      }));
    }, ICON_LINK_SELECTOR);
  } catch {
    // A page that can't be evaluated (navigated away, closed) still has an
    // origin to try the conventional path on.
  }

  for (const url of orderFaviconCandidates(links, page.url())) {
    try {
      // The API request context shares the page's cookies but bypasses
      // page.route - so an icon on a third-party CDN, which the
      // stabilization blocklist would cut off inside the page, still loads.
      const response = await page.request.get(url, {
        timeout: REQUEST_TIMEOUT_MS,
        maxRedirects: 5,
        failOnStatusCode: false,
      });
      if (!response.ok()) continue;
      const buffer = await response.body();
      if (buffer.length === 0 || buffer.length > MAX_FAVICON_BYTES) continue;
      const format = sniffImageFormat(buffer);
      if (format === null) continue;
      return { buffer, format };
    } catch {
      // Unreachable, timed out - try the next candidate.
    }
  }
  return null;
}

// The URLs to try, best first: declared icons (raster before SVG - an ICO or
// PNG renders predictably at 16px, and SVG needs a sandboxed response),
// then apple-touch-icons, then the conventional /favicon.ico of the page's
// origin. http(s) only - a data: URL can't be fetched and isn't worth
// decoding for a decoration - and deduplicated in order.
export function orderFaviconCandidates(links: readonly IconLink[], pageUrl: string): string[] {
  const rasterIcons: string[] = [];
  const svgIcons: string[] = [];
  const appleTouch: string[] = [];
  for (const link of links) {
    if (!isHttpUrl(link.href)) continue;
    const rel = link.rel.toLowerCase().split(/\s+/);
    if (rel.includes("icon")) {
      (isSvg(link) ? svgIcons : rasterIcons).push(link.href);
    } else if (rel.some((token) => token.startsWith("apple-touch-icon"))) {
      appleTouch.push(link.href);
    }
  }

  const candidates = [...rasterIcons, ...svgIcons, ...appleTouch];
  const origin = originOf(pageUrl);
  if (origin) candidates.push(`${origin}/favicon.ico`);
  return [...new Set(candidates)];
}

function isSvg(link: IconLink): boolean {
  return link.type.toLowerCase().includes("svg") || /\.svg(\?|#|$)/i.test(link.href);
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function originOf(pageUrl: string): string | null {
  try {
    const url = new URL(pageUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

// The image format the bytes actually are - never the site's Content-Type,
// which is routinely wrong for favicons (image/x-icon on a PNG, text/plain,
// or the HTML of a soft-404 page). Unknown bytes are dropped.
export function sniffImageFormat(bytes: Buffer): FaviconFormat | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(bytes, [0x00, 0x00, 0x01, 0x00])) return "ico";
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "gif";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpg";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && bytes.subarray(8, 12).toString("latin1") === "WEBP") {
    return "webp";
  }
  // SVG is text: an optional BOM, XML declaration, comments and doctype,
  // then the <svg> root. Only the head of the file is looked at.
  const head = bytes
    .subarray(0, 1024)
    .toString("utf8")
    .replace(/^\uFEFF/, "");
  if (/^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(head)) return "svg";
  return null;
}

function startsWith(bytes: Buffer, magic: readonly number[]): boolean {
  return magic.every((byte, index) => bytes[index] === byte);
}
