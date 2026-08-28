import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { collectRegions, segmentPage } from "./regions.js";

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

async function withPage<T>(
  html: string,
  run: (page: Page) => Promise<T>,
  options: { deviceScaleFactor?: number } = {},
): Promise<T> {
  const context = await browser.newContext({
    viewport: { width: 1000, height: 600 },
    deviceScaleFactor: options.deviceScaleFactor ?? 1,
  });
  const page = await context.newPage();
  try {
    await page.setContent(
      `<!doctype html><html><head><style>body{margin:0}h1,h2,h3,h4,h5,h6{margin:0}</style></head><body>${html}</body></html>`,
    );
    return await run(page);
  } finally {
    await context.close();
  }
}

const block = (tag: string, attrs: string, height: number, inner = "") =>
  `<${tag} ${attrs} style="height:${height}px;width:100%">${inner}</${tag}>`;

describe("segmentPage", () => {
  it("takes semantic blocks as units and labels them by id or heading", async () => {
    const html =
      block("header", "", 80) +
      block("nav", 'id="menu"', 40) +
      block(
        "section",
        'id="pricing"',
        300,
        "<h2>  Plans &amp;\n prices </h2>" + block("div", "", 100) + block("div", "", 100),
      ) +
      block("footer", "", 120);
    const regions = await withPage(html, (page) => page.evaluate(segmentPage, 1));

    expect(regions).toEqual([
      { key: "header", label: "header", x: 0, y: 0, width: 1000, height: 80 },
      { key: "nav#menu", label: "nav#menu", x: 0, y: 80, width: 1000, height: 40 },
      {
        key: "section#pricing",
        label: 'section#pricing › "Plans & prices"',
        x: 0,
        y: 120,
        width: 1000,
        height: 300,
      },
      { key: "footer", label: "footer", x: 0, y: 420, width: 1000, height: 120 },
    ]);
  });

  it("descends through main and through single-child wrappers", async () => {
    const html = block(
      "div",
      'id="app"',
      400,
      block("main", "", 400, block("section", 'id="a"', 200) + block("section", 'id="b"', 200)),
    );
    const regions = await withPage(html, (page) => page.evaluate(segmentPage, 1));

    expect(regions.map((region) => region.key)).toEqual(["section#a", "section#b"]);
  });

  it("splits a plain container with two or more significant children, keying by tag and role", async () => {
    const html = block(
      "div",
      "",
      300,
      block("div", 'role="banner"', 100) + block("div", "", 100) + block("div", "", 100),
    );
    const regions = await withPage(html, (page) => page.evaluate(segmentPage, 1));

    expect(regions.map((region) => region.key)).toEqual(["div[banner]", "div", "div"]);
  });

  it("ignores hidden, tiny and non-content elements", async () => {
    const html =
      block("section", 'id="shown"', 100) +
      block("section", 'id="hidden" hidden', 100) +
      block("section", 'id="invisible"', 100).replace('style="', 'style="visibility:hidden;') +
      block("section", 'id="short"', 20) +
      '<section id="narrow" style="height:100px;width:50px"></section>' +
      "<script>/* no */</script>" +
      block("section", 'id="last"', 100);
    const regions = await withPage(html, (page) => page.evaluate(segmentPage, 1));

    expect(regions.map((region) => region.key)).toEqual(["section#shown", "section#last"]);
  });

  it("stops splitting at the 40-region cap and keeps the parent level", async () => {
    const sections = Array.from({ length: 60 }, (_, index) => block("div", `id="s${index}"`, 40)).join("");
    const html = block("section", 'id="left"', 100) + block("div", 'id="grid"', 2400, sections);
    const regions = await withPage(html, (page) => page.evaluate(segmentPage, 1));

    // body → [section#left, div#grid] is level 1 (2 regions); splitting
    // div#grid would make 61 > 40, so the walk stops there.
    expect(regions.map((region) => region.key)).toEqual(["section#left", "div#grid"]);
  });

  it("reports a fixed header where fullPage paints it and scales by deviceScaleFactor", async () => {
    const html =
      '<header style="position:fixed;top:0;left:0;width:100%;height:50px"></header>' +
      block("section", 'id="body"', 900).replace('style="', 'style="margin-top:50px;');
    const regions = await withPage(html, (page) => page.evaluate(segmentPage, 2), { deviceScaleFactor: 2 });

    expect(regions).toEqual([
      { key: "header", label: "header", x: 0, y: 0, width: 2000, height: 100 },
      { key: "section#body", label: "section#body", x: 0, y: 100, width: 2000, height: 1800 },
    ]);
  });

  it("returns an empty list for a page with nothing significant on it", async () => {
    const regions = await withPage("<p>hi</p>", (page) => page.evaluate(segmentPage, 1));
    expect(regions).toEqual([]);
  });
});

// Note: vitest's transform injects no esbuild `__name` helper, so this
// suite runs a plain function through page.evaluate and cannot catch
// helper-injection bugs like the one collectRegions works around (only
// reproduced under real tsx). The `globalThis.__name ??= ...` prelude in
// collectRegions is the actual guard against that class of bug, not this test.
describe("collectRegions", () => {
  it("returns the scan, and null (not a throw) when the page cannot be evaluated", async () => {
    const regions = await withPage(block("section", 'id="x"', 100), (page) =>
      collectRegions(page, 1, "/x @ Desktop"),
    );
    expect(regions?.map((region) => region.key)).toEqual(["section#x"]);

    const failed = await withPage("", async (page) => {
      await page.close();
      return collectRegions(page, 1, "/closed @ Desktop");
    });
    expect(failed).toBeNull();
  });
});
