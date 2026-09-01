import { STATUS_CODES } from "node:http";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { PageRow, Viewport } from "@vrt/db";
import type { CaptureFailureKind, Region, RunProgress } from "@vrt/shared";
import { CaptureError, classifyCaptureError } from "./capture-failure.js";
import { withDeadline } from "./deadline.js";
import { captureFavicon, type CapturedFavicon } from "./favicon.js";
import { clipRegionsToImage, collectRegions } from "./regions.js";
import { prepareContext, stabilizePage } from "./stabilize.js";

// Everything one page/viewport pair may take: navigation (30 s of Playwright's
// own), stabilization, the region scan and the screenshot. Generous on
// purpose - a slow site must still capture - but finite, which the steps
// inside are not: `page.evaluate` has no timeout in Playwright, so a renderer
// that dies unnoticed parks stabilizePage for ever (deadline.ts).
const PAGE_CAPTURE_TIMEOUT_MS = 120_000;
// Closing has no timeout of its own either, and a browser wedged badly enough
// that close() never returns is exactly the state this whole file is now
// guarding against.
const CLOSE_TIMEOUT_MS = 15_000;

export interface CapturedShot {
  pageId: string;
  viewportId: string;
  buffer: Buffer;
  // Top-level DOM blocks in screenshot pixels, or null when the scan
  // failed - the shot itself is unaffected either way (regions.ts).
  regions: Region[] | null;
}

export interface CaptureFailure {
  pageId: string;
  viewportId: string;
  kind: CaptureFailureKind;
  message: string;
}

export interface CaptureResult {
  shots: CapturedShot[];
  failures: CaptureFailure[];
  // Only looked for when asked (`wantFavicon`), and null when no candidate
  // loaded - the run itself is unaffected either way.
  favicon: CapturedFavicon | null;
}

// What one page/viewport pair yields. Named (rather than inlined on
// capturePage) so the call site can annotate its result: without that, `let
// favicon` narrowing through `favicon ??= captured.favicon` and back into
// capturePage's own `wantFavicon` argument is a circular inference (TS7022).
interface CapturedPage {
  buffer: Buffer;
  regions: Region[] | null;
  favicon: CapturedFavicon | null;
}

export interface CaptureOptions {
  // Ask for the site's favicon (see favicon.ts): picked off the first page
  // that captures successfully, right after its screenshot, so it costs no
  // navigation and can't disturb the capture. The processor asks only
  // while the project has none stored.
  wantFavicon?: boolean;
}

export async function captureProjectShots(
  baseUrl: string,
  pageConfigs: PageRow[],
  viewportConfigs: Viewport[],
  launchBrowser: () => Promise<Browser> = () => chromium.launch(),
  onProgress?: (progress: RunProgress) => void,
  options: CaptureOptions = {},
): Promise<CaptureResult> {
  const browser = await launchBrowser();
  const shots: CapturedShot[] = [];
  const failures: CaptureFailure[] = [];
  let favicon: CapturedFavicon | null = null;
  const total = pageConfigs.length * viewportConfigs.length;
  let completed = 0;

  try {
    for (const viewport of viewportConfigs) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.deviceScaleFactor,
        reducedMotion: "reduce",
        // Date is frozen by the init script, but the *rendering* of that
        // frozen instant still goes through the host timezone/locale - a
        // baseline captured in Docker vs a run from the host machine would
        // otherwise diff on every formatted timestamp.
        timezoneId: "UTC",
        locale: "en-US",
      });

      try {
        await prepareContext(context);

        for (const pageConfig of pageConfigs) {
          const page = await context.newPage();
          // Reported *before* the capture so the UI names the shot currently in
          // flight, not the one just finished.
          onProgress?.({
            phase: "capturing",
            completed,
            total,
            label: `${pageConfig.label} @ ${viewport.label}`,
          });
          completed++;
          const pairLabel = `${pageConfig.path} @ ${viewport.label}`;
          try {
            const captured: CapturedPage = await withDeadline(
              capturePage(
                page,
                context,
                baseUrl,
                pageConfig,
                viewport,
                options.wantFavicon === true && favicon === null,
              ),
              PAGE_CAPTURE_TIMEOUT_MS,
              `Capture of ${pairLabel}`,
            );
            shots.push({
              pageId: pageConfig.id,
              viewportId: viewport.id,
              buffer: captured.buffer,
              regions: captured.regions,
            });
            favicon ??= captured.favicon;
          } catch (error) {
            // One page failing to load/stabilize/screenshot (e.g. a transient
            // navigation timeout, or the deadline above) shouldn't discard
            // every other page already captured in this run - skip it, but
            // record the failure so the run can report it instead of silently
            // looking complete.
            const { kind, message } = classifyCaptureError(error);
            failures.push({ pageId: pageConfig.id, viewportId: viewport.id, kind, message });
            console.error(`Failed to capture ${pageConfig.path} at viewport ${viewport.label}:`, message);
          } finally {
            // A page abandoned by the deadline is still open, and closing it
            // is what finally rejects whatever protocol call was parked on it.
            await closeQuietly(`page ${pairLabel}`, () => page.close());
          }
        }
      } finally {
        await closeQuietly(`context for viewport ${viewport.label}`, () => context.close());
      }
    }
  } finally {
    await closeQuietly("browser", () => browser.close());
  }

  return { shots, failures, favicon };
}

/**
 * One page/viewport pair, start to finish - extracted from the loop so the
 * whole of it can be handed to `withDeadline` as a single promise. It owns no
 * cleanup: the caller's `finally` closes the page, which matters precisely
 * when this promise was abandoned and is still running.
 */
async function capturePage(
  page: Page,
  context: BrowserContext,
  baseUrl: string,
  pageConfig: PageRow,
  viewport: Viewport,
  wantFavicon: boolean,
): Promise<CapturedPage> {
  // Inside the deadline (and so inside the caller's catch) so a malformed
  // path fails only this page, the same way a navigation timeout on it would.
  const url = new URL(pageConfig.path, baseUrl).toString();
  await navigateToPage(page, context, url);
  await stabilizePage(page, pageConfig.waitSelector ?? undefined);

  // Geometry first, then pixels: a fullPage screenshot resizes the viewport
  // and can re-fire reveal animations (CLAUDE.md §5.8), so the rects are read
  // while the page is still as stabilised as it will be. The image size is
  // only known afterwards, which is when the rects are clipped to it.
  const scanLabel = `${pageConfig.path} @ ${viewport.label}`;
  const rawRegions = await collectRegions(page, viewport.deviceScaleFactor, scanLabel);

  const buffer = await page.screenshot({
    fullPage: true,
    mask: pageConfig.maskSelectors.map((selector) => page.locator(selector)),
  });
  const regions = rawRegions === null ? null : await clipRegionsToImage(rawRegions, buffer, scanLabel);

  // captureFavicon never throws; a site without an icon just leaves this null
  // and the next run tries again.
  const favicon = wantFavicon ? await captureFavicon(page) : null;

  return { buffer, regions, favicon };
}

/**
 * Closing is cleanup, and cleanup must not be able to end a run: a
 * `browser.close()` that throws inside a `finally` would replace whatever the
 * run was really doing, and one that never returns used to hold the worker's
 * single concurrency slot for ever. Worst case now the browser process
 * outlives us and the job deadline in queue.ts takes the worker down with it.
 */
async function closeQuietly(what: string, close: () => Promise<void>): Promise<void> {
  try {
    await withDeadline(close(), CLOSE_TIMEOUT_MS, `Closing ${what}`);
  } catch (error) {
    console.error(`Failed to close ${what}:`, error instanceof Error ? error.message : String(error));
  }
}

function isHtml(contentType: string | undefined): boolean {
  return contentType === undefined || /\bhtml\b/i.test(contentType);
}

function notHtmlError(contentType: string): CaptureError {
  // "application/pdf", not "text/plain; charset=utf-8" - the parameters
  // don't help a reader.
  const mediaType = contentType.split(";")[0]!.trim();
  return new CaptureError("not-html", `Server responded with ${mediaType}, not an HTML page`);
}

// Navigation plus the two checks Playwright itself never makes: goto resolves
// happily on a 404 (we would otherwise screenshot the error page and, on a
// first run, enshrine it as the baseline), and headless Chromium turns a
// PDF/download into net::ERR_ABORTED without ever exposing the response.
async function navigateToPage(page: Page, context: BrowserContext, url: string): Promise<void> {
  let response;
  try {
    response = await page.goto(url, { waitUntil: "load" });
  } catch (error) {
    if (error instanceof Error && error.message.includes("net::ERR_ABORTED")) {
      // A HEAD request answers "what did the server actually send" - the
      // navigation's own response is gone. Anything else the probe finds
      // (or a probe failure) leaves the original error to be classified.
      const contentType = await probeContentType(context, url);
      if (contentType && !isHtml(contentType)) {
        throw notHtmlError(contentType);
      }
    }
    throw error;
  }

  // null response = same-document navigation (about:blank, hash change);
  // nothing to check.
  if (!response) {
    return;
  }
  const status = response.status();
  if (status >= 400) {
    // HTTP/2 carries no reason phrase, so statusText is usually empty there;
    // Node's table fills in the conventional one.
    const reason = response.statusText() || STATUS_CODES[status] || "";
    throw new CaptureError("http-error", `HTTP ${status} ${reason}`.trim());
  }
  const contentType = response.headers()["content-type"];
  if (contentType && !isHtml(contentType)) {
    throw notHtmlError(contentType);
  }
}

async function probeContentType(context: BrowserContext, url: string): Promise<string | undefined> {
  try {
    const probe = await context.request.head(url);
    return probe.headers()["content-type"];
  } catch {
    return undefined;
  }
}
