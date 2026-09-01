import { afterEach, describe, expect, it, vi } from "vitest";
import type { Browser } from "playwright";
import sharp from "sharp";
import type { PageRow, Viewport } from "@vrt/db";
import type { RunProgress } from "@vrt/shared";
import { captureProjectShots } from "./capture.js";

type PageBehavior =
  | "succeed"
  | "fail"
  // A page that never answers at all - the shape a dead renderer leaves
  // behind, which Playwright itself would wait on for ever.
  | "hang"
  | { gotoError: string }
  | { status: number; statusText?: string; contentType?: string };

function fakeResponse(status: number, statusText: string, contentType: string | undefined) {
  return {
    status: () => status,
    statusText: () => statusText,
    headers: () => (contentType ? { "content-type": contentType } : {}),
  };
}

function fakePage(behavior: PageBehavior, options: { regions?: unknown; screenshot?: Buffer } = {}) {
  return {
    goto: vi.fn(async () => {
      if (behavior === "hang") return new Promise<never>(() => {});
      if (behavior === "fail") throw new Error("navigation timeout");
      if (behavior === "succeed") return fakeResponse(200, "OK", "text/html; charset=utf-8");
      if ("gotoError" in behavior) throw new Error(behavior.gotoError);
      return fakeResponse(behavior.status, behavior.statusText ?? "", behavior.contentType);
    }),
    evaluate: vi.fn(async (fn: unknown) =>
      typeof fn === "function" && fn.name === "segmentPage" ? options.regions : undefined,
    ),
    waitForFunction: vi.fn(async () => undefined),
    waitForTimeout: vi.fn(async () => undefined),
    waitForSelector: vi.fn(async () => undefined),
    screenshot: vi.fn(async () => options.screenshot ?? Buffer.from("fake-png-bytes")),
    locator: vi.fn(() => ({})),
    close: vi.fn(async () => undefined),
  };
}

function fakeBrowser(
  pages: ReturnType<typeof fakePage>[],
  probe: { contentType?: string; error?: string } = { contentType: "text/html" },
) {
  let nextPageIndex = 0;
  const context = {
    addInitScript: vi.fn(async () => undefined),
    route: vi.fn(async () => undefined),
    newPage: vi.fn(async () => pages[nextPageIndex++]),
    close: vi.fn(async () => undefined),
    request: {
      head: vi.fn(async () => {
        if (probe.error) throw new Error(probe.error);
        return { headers: () => (probe.contentType ? { "content-type": probe.contentType } : {}) };
      }),
    },
  };
  return {
    newContext: vi.fn(async () => context),
    close: vi.fn(async () => undefined),
  };
}

function makePageConfig(id: string): PageRow {
  return {
    id,
    projectId: "project-1",
    path: `/${id}`,
    label: id,
    waitSelector: null,
    maskSelectors: [],
    createdAt: new Date(),
  } as PageRow;
}

function makeViewportConfig(id: string): Viewport {
  return {
    id,
    projectId: "project-1",
    label: id,
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    createdAt: new Date(),
  } as Viewport;
}

describe("captureProjectShots", () => {
  it("keeps shots from pages that succeed when another page fails to load", async () => {
    const pages = [fakePage("succeed"), fakePage("fail"), fakePage("succeed")];
    const browser = fakeBrowser(pages);
    const pageConfigs = [makePageConfig("page-1"), makePageConfig("page-2"), makePageConfig("page-3")];
    const viewportConfigs = [makeViewportConfig("viewport-1")];

    const { shots } = await captureProjectShots(
      "https://example.com",
      pageConfigs,
      viewportConfigs,
      async () => browser as unknown as Browser,
    );

    expect(shots.map((shot) => shot.pageId)).toEqual(["page-1", "page-3"]);
  });

  it("reports each failed capture with its page, viewport, kind and message instead of only logging it", async () => {
    const pages = [fakePage("succeed"), fakePage({ gotoError: "page.goto: Timeout 30000ms exceeded." })];
    const browser = fakeBrowser(pages);
    const pageConfigs = [makePageConfig("page-1"), makePageConfig("page-2")];
    const viewportConfigs = [makeViewportConfig("viewport-1")];

    const { failures } = await captureProjectShots(
      "https://example.com",
      pageConfigs,
      viewportConfigs,
      async () => browser as unknown as Browser,
    );

    expect(failures).toEqual([
      {
        pageId: "page-2",
        viewportId: "viewport-1",
        kind: "timeout",
        message: "page.goto: Timeout 30000ms exceeded.",
      },
    ]);
  });

  it("fails a capture whose server answered 4xx/5xx instead of screenshotting the error page", async () => {
    const pages = [fakePage({ status: 404, statusText: "Not Found", contentType: "text/html" })];
    const browser = fakeBrowser(pages);

    const { shots, failures } = await captureProjectShots(
      "https://example.com",
      [makePageConfig("page-1")],
      [makeViewportConfig("viewport-1")],
      async () => browser as unknown as Browser,
    );

    expect(shots).toEqual([]);
    expect(pages[0]!.screenshot).not.toHaveBeenCalled();
    expect(failures).toEqual([
      { pageId: "page-1", viewportId: "viewport-1", kind: "http-error", message: "HTTP 404 Not Found" },
    ]);
  });

  it("names the status when the server sent no reason phrase (HTTP/2 never does)", async () => {
    const pages = [fakePage({ status: 503, statusText: "", contentType: "text/html" })];
    const browser = fakeBrowser(pages);

    const { failures } = await captureProjectShots(
      "https://example.com",
      [makePageConfig("page-1")],
      [makeViewportConfig("viewport-1")],
      async () => browser as unknown as Browser,
    );

    expect(failures[0]).toMatchObject({ kind: "http-error", message: "HTTP 503 Service Unavailable" });
  });

  it("fails a capture that navigated fine but received a non-HTML document", async () => {
    const pages = [fakePage({ status: 200, contentType: "image/png" })];
    const browser = fakeBrowser(pages);

    const { failures } = await captureProjectShots(
      "https://example.com",
      [makePageConfig("page-1")],
      [makeViewportConfig("viewport-1")],
      async () => browser as unknown as Browser,
    );

    expect(failures).toEqual([
      {
        pageId: "page-1",
        viewportId: "viewport-1",
        kind: "not-html",
        message: "Server responded with image/png, not an HTML page",
      },
    ]);
  });

  it("probes an aborted navigation and reports a download (PDF) as not-html", async () => {
    // Headless Chromium turns a PDF navigation into a download and reports
    // net::ERR_ABORTED - the response is never exposed, so the content type
    // comes from a follow-up HEAD request.
    const pages = [fakePage({ gotoError: "page.goto: net::ERR_ABORTED at https://example.com/cv.pdf" })];
    const browser = fakeBrowser(pages, { contentType: "application/pdf" });

    const { failures } = await captureProjectShots(
      "https://example.com",
      [{ ...makePageConfig("page-1"), path: "/cv.pdf" }],
      [makeViewportConfig("viewport-1")],
      async () => browser as unknown as Browser,
    );

    expect(failures).toEqual([
      {
        pageId: "page-1",
        viewportId: "viewport-1",
        kind: "not-html",
        message: "Server responded with application/pdf, not an HTML page",
      },
    ]);
  });

  it("keeps an aborted navigation as 'other' when the probe can't explain it", async () => {
    const pages = [fakePage({ gotoError: "page.goto: net::ERR_ABORTED at https://example.com/x" })];
    const browser = fakeBrowser(pages, { error: "connection reset" });

    const { failures } = await captureProjectShots(
      "https://example.com",
      [makePageConfig("page-1")],
      [makeViewportConfig("viewport-1")],
      async () => browser as unknown as Browser,
    );

    expect(failures[0]).toMatchObject({
      kind: "other",
      message: "page.goto: net::ERR_ABORTED at https://example.com/x",
    });
  });

  it("pins timezone and locale on the context so timestamp rendering can't differ between hosts", async () => {
    const pages = [fakePage("succeed")];
    const browser = fakeBrowser(pages);

    await captureProjectShots(
      "https://example.com",
      [makePageConfig("page-1")],
      [makeViewportConfig("viewport-1")],
      async () => browser as unknown as Browser,
    );

    expect(browser.newContext).toHaveBeenCalledWith(
      expect.objectContaining({ timezoneId: "UTC", locale: "en-US" }),
    );
  });

  it("reports capture progress before each shot, with a running total", async () => {
    const pages = [fakePage("succeed"), fakePage("succeed")];
    const browser = fakeBrowser(pages);
    const pageConfigs: PageRow[] = [
      { ...makePageConfig("page-home"), path: "/", label: "home" },
      { ...makePageConfig("page-cv"), path: "/cv", label: "cv" },
    ];
    const viewportConfigs = [{ ...makeViewportConfig("vp-desktop"), label: "Desktop" }];
    const progress: RunProgress[] = [];

    await captureProjectShots(
      "https://example.com",
      pageConfigs,
      viewportConfigs,
      async () => browser as unknown as Browser,
      (report) => progress.push(report),
    );

    expect(progress).toEqual([
      { phase: "capturing", completed: 0, total: 2, label: "home @ Desktop" },
      { phase: "capturing", completed: 1, total: 2, label: "cv @ Desktop" },
    ]);
  });

  it("scans the page's regions before the screenshot and clips them to the image", async () => {
    const png = await sharp({ create: { width: 200, height: 100, channels: 3, background: "#fff" } })
      .png()
      .toBuffer();
    const page = fakePage("succeed", {
      regions: [{ key: "section#a", label: "section#a", x: 0, y: 50.4, width: 200, height: 120 }],
      screenshot: png,
    });
    const browser = fakeBrowser([page]);

    const { shots } = await captureProjectShots(
      "https://example.com",
      [makePageConfig("page-1")],
      [makeViewportConfig("viewport-1")],
      async () => browser as unknown as Browser,
    );

    expect(shots[0]?.regions).toEqual([
      { key: "section#a", label: "section#a", x: 0, y: 50, width: 200, height: 50 },
    ]);
    // The scan reads geometry before fullPage resizes the viewport.
    const scanCall = page.evaluate.mock.invocationCallOrder.find(
      (_, index) =>
        (page.evaluate.mock.calls[index]?.[0] as { name?: string } | undefined)?.name === "segmentPage",
    );
    expect(scanCall).toBeLessThan(page.screenshot.mock.invocationCallOrder[0]!);
  });

  it("keeps the shot, with regions null, when the region scan yields nothing usable", async () => {
    const page = fakePage("succeed"); // evaluate → undefined, screenshot → not a PNG
    const browser = fakeBrowser([page]);

    const { shots, failures } = await captureProjectShots(
      "https://example.com",
      [makePageConfig("page-1")],
      [makeViewportConfig("viewport-1")],
      async () => browser as unknown as Browser,
    );

    expect(failures).toEqual([]);
    expect(shots).toHaveLength(1);
    expect(shots[0]?.regions).toBeNull();
  });
});

describe("captureProjectShots deadline", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("gives up on a page that never answers and keeps capturing the rest of the run", async () => {
    // The 2026-08-31 production hang, in miniature: the middle page's
    // navigation never settles (a renderer killed under memory pressure looks
    // exactly like this from Node's side), and no Playwright call involved
    // has a timeout that would ever fire.
    vi.useFakeTimers();
    const pages = [fakePage("succeed"), fakePage("hang"), fakePage("succeed")];
    const browser = fakeBrowser(pages);
    const pageConfigs = [makePageConfig("page-1"), makePageConfig("page-2"), makePageConfig("page-3")];

    const capturing = captureProjectShots(
      "https://example.com",
      pageConfigs,
      [makeViewportConfig("viewport-1")],
      async () => browser as unknown as Browser,
    );
    // Let the run reach the hanging page (so its deadline timer exists), then
    // move past any deadline this file could reasonably use.
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    const { shots, failures } = await capturing;

    expect(shots.map((shot) => shot.pageId)).toEqual(["page-1", "page-3"]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ pageId: "page-2", viewportId: "viewport-1", kind: "timeout" });
    expect(failures[0]?.message).toContain("/page-2 @ viewport-1");
    // Closing the abandoned page is what finally releases the parked call.
    expect(pages[1]!.close).toHaveBeenCalled();
    expect(browser.close).toHaveBeenCalled();
  });

  it("finishes the run when closing a page hangs, instead of taking the worker down with it", async () => {
    vi.useFakeTimers();
    const pages = [fakePage("succeed")];
    pages[0]!.close = vi.fn(() => new Promise<never>(() => {}));
    const browser = fakeBrowser(pages);

    const capturing = captureProjectShots(
      "https://example.com",
      [makePageConfig("page-1")],
      [makeViewportConfig("viewport-1")],
      async () => browser as unknown as Browser,
    );
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    const { shots, failures } = await capturing;

    // The shot was already taken - a cleanup step must not be able to lose it.
    expect(shots.map((shot) => shot.pageId)).toEqual(["page-1"]);
    expect(failures).toEqual([]);
    expect(browser.close).toHaveBeenCalled();
  });
});
