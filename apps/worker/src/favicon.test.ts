import { describe, expect, it, vi } from "vitest";
import type { Page } from "playwright";
import { captureFavicon, orderFaviconCandidates, sniffImageFormat, type IconLink } from "./favicon.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const ICO = Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]);

function link(href: string, rel = "icon", type = ""): IconLink {
  return { href, rel, type };
}

describe("orderFaviconCandidates", () => {
  it("tries raster icons, then SVG icons, then apple-touch, then /favicon.ico", () => {
    const links = [
      link("https://s.test/apple.png", "apple-touch-icon"),
      link("https://s.test/icon.svg", "icon", "image/svg+xml"),
      link("https://s.test/icon-32.png", "icon", "image/png"),
      link("https://s.test/legacy.ico", "shortcut icon"),
    ];
    expect(orderFaviconCandidates(links, "https://s.test/docs/intro")).toEqual([
      "https://s.test/icon-32.png",
      "https://s.test/legacy.ico",
      "https://s.test/icon.svg",
      "https://s.test/apple.png",
      "https://s.test/favicon.ico",
    ]);
  });

  it("drops non-http hrefs, ignores unrelated rels and deduplicates", () => {
    const links = [
      link("data:image/png;base64,AAAA"),
      link("https://s.test/pinned.svg", "mask-icon"),
      link("https://s.test/favicon.ico"),
      link("https://s.test/favicon.ico", "shortcut icon"),
    ];
    expect(orderFaviconCandidates(links, "https://s.test/")).toEqual(["https://s.test/favicon.ico"]);
  });

  it("falls back to the origin's /favicon.ico alone when nothing is declared", () => {
    expect(orderFaviconCandidates([], "https://s.test:8443/a/b?c")).toEqual([
      "https://s.test:8443/favicon.ico",
    ]);
    expect(orderFaviconCandidates([], "about:blank")).toEqual([]);
  });
});

describe("sniffImageFormat", () => {
  it("recognises the raster formats by magic bytes", () => {
    expect(sniffImageFormat(PNG)).toBe("png");
    expect(sniffImageFormat(ICO)).toBe("ico");
    expect(sniffImageFormat(Buffer.from("GIF89a...."))).toBe("gif");
    expect(sniffImageFormat(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpg");
    expect(sniffImageFormat(Buffer.from("RIFF\0\0\0\0WEBPVP8 "))).toBe("webp");
  });

  it("recognises SVG text with a BOM, XML declaration, comment or doctype in front", () => {
    expect(sniffImageFormat(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe("svg");
    expect(
      sniffImageFormat(
        Buffer.from(
          '﻿<?xml version="1.0"?>\n<!-- hi -->\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN">\n<svg>',
        ),
      ),
    ).toBe("svg");
  });

  it("returns null for anything else - notably the HTML of a soft-404", () => {
    expect(sniffImageFormat(Buffer.from("<!DOCTYPE html><html><body>Not found</body></html>"))).toBeNull();
    expect(sniffImageFormat(Buffer.alloc(0))).toBeNull();
    expect(sniffImageFormat(Buffer.from([0x00, 0x00, 0x02, 0x00]))).toBeNull(); // .cur, not .ico
  });
});

function fakePage(
  links: IconLink[],
  responses: Record<string, { status: number; body: Buffer } | Error>,
  pageUrl = "https://s.test/home",
): { page: Page; get: ReturnType<typeof vi.fn> } {
  const get = vi.fn(async (url: string) => {
    const response = responses[url];
    if (!response) return { ok: () => false, body: async () => Buffer.alloc(0) };
    if (response instanceof Error) throw response;
    return { ok: () => response.status < 400, body: async () => response.body };
  });
  const page = {
    evaluate: vi.fn(async () => links),
    url: () => pageUrl,
    request: { get },
  } as unknown as Page;
  return { page, get };
}

describe("captureFavicon", () => {
  it("returns the first candidate that responds with real image bytes", async () => {
    const { page, get } = fakePage([link("https://s.test/icon.png")], {
      "https://s.test/icon.png": { status: 404, body: Buffer.from("<html>nope</html>") },
      "https://s.test/favicon.ico": { status: 200, body: ICO },
    });
    await expect(captureFavicon(page)).resolves.toEqual({ buffer: ICO, format: "ico" });
    expect(get.mock.calls.map((call) => call[0])).toEqual([
      "https://s.test/icon.png",
      "https://s.test/favicon.ico",
    ]);
  });

  it("skips 200 responses whose bytes aren't an image (soft 404) and oversized files", async () => {
    const { page } = fakePage([link("https://s.test/a.png"), link("https://s.test/b.png")], {
      "https://s.test/a.png": { status: 200, body: Buffer.from("<!DOCTYPE html>") },
      "https://s.test/b.png": { status: 200, body: Buffer.concat([PNG, Buffer.alloc(600 * 1024)]) },
      "https://s.test/favicon.ico": { status: 200, body: PNG },
    });
    // The conventional path returns PNG bytes here - format follows the
    // bytes, not the URL's extension.
    await expect(captureFavicon(page)).resolves.toEqual({ buffer: PNG, format: "png" });
  });

  it("survives request errors and a failing evaluate, returning null when nothing loads", async () => {
    const { page } = fakePage([link("https://s.test/icon.png")], {
      "https://s.test/icon.png": new Error("net::ERR_CONNECTION_REFUSED"),
    });
    await expect(captureFavicon(page)).resolves.toBeNull();

    const broken = {
      evaluate: vi.fn(async () => {
        throw new Error("Execution context was destroyed");
      }),
      url: () => "https://s.test/",
      request: { get: vi.fn(async () => ({ ok: () => true, body: async () => ICO })) },
    } as unknown as Page;
    await expect(captureFavicon(broken)).resolves.toEqual({ buffer: ICO, format: "ico" });
  });
});
