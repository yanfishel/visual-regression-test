import type { BrowserContext, Page } from "playwright";

// Domains that load unpredictably and often paint over content - blocked at
// the network level so they can never cause a false-positive diff.
const BLOCKED_HOST_PATTERNS = [
  /google-analytics\.com/,
  /googletagmanager\.com/,
  /doubleclick\.net/,
  /connect\.facebook\.net/,
  /hotjar\.com/,
  /intercom\.io/,
  /intercomcdn\.com/,
  /drift\.com/,
  /crisp\.chat/,
  /segment\.(io|com)/,
  /mixpanel\.com/,
  /amplitude\.com/,
  /clarity\.ms/,
  /sentry\.io/,
  /tawk\.to/,
];

// Fixed epoch used to freeze Date across every run. Must be a constant, not
// Date.now() at injection time - the latter still varies run to run (see
// CLAUDE.md ss5.4), defeating the point of freezing it.
const FIXED_EPOCH_MS = 1704067200000; // 2024-01-01T00:00:00.000Z

// Freezes Date and Math.random before any page script runs, so "5 minutes
// ago" labels, rotating banners, and carousels render identically every run.
export const FREEZE_TIME_AND_RANDOM = `(() => {
  const fixedNow = ${FIXED_EPOCH_MS};
  const OriginalDate = Date;
  class FrozenDate extends OriginalDate {
    constructor(...args) {
      if (args.length === 0) {
        super(fixedNow);
      } else {
        super(...args);
      }
    }
    static now() {
      return fixedNow;
    }
  }
  // @ts-ignore
  window.Date = FrozenDate;

  let seed = 42;
  Math.random = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
})();`;

const KILL_ANIMATIONS_CSS = `*, *::before, *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
  scroll-behavior: auto !important;
  caret-color: transparent !important;
}`;

// Injected as a context-level init script (runs before any of the page's own
// scripts, and before the page's own CSS has a chance to start an animation)
// rather than via page.addStyleTag() after navigation - by the time an
// addStyleTag call after page.goto('load') resolves, a load-time animation
// may already be mid-flight.
//
// Confirmed against a real page in Docker: document.write() at this point
// (before the document has been parsed) reliably hangs navigation - the
// 'load' event never fires and page.goto() times out. A MutationObserver
// that waits for document.head/documentElement and appendChild()s a <style>
// tag achieves the same "as early as possible" placement without touching
// document.write/open.
export const INJECT_ANIMATION_KILL_CSS = `(() => {
  const styleContent = ${JSON.stringify(KILL_ANIMATIONS_CSS)};
  function inject() {
    const target = document.head || document.documentElement;
    if (!target) return false;
    const style = document.createElement("style");
    style.textContent = styleContent;
    target.appendChild(style);
    return true;
  }
  if (inject()) return;
  const observer = new MutationObserver(() => {
    if (inject()) observer.disconnect();
  });
  observer.observe(document, { childList: true, subtree: true });
})();`;

/** Context-level setup that must be in place before navigation starts. */
export async function prepareContext(context: BrowserContext): Promise<void> {
  await context.addInitScript(FREEZE_TIME_AND_RANDOM);
  await context.addInitScript(INJECT_ANIMATION_KILL_CSS);
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(url))) {
      return route.abort();
    }
    return route.continue();
  });
}

/**
 * Per-page settling that must happen after navigation, before the screenshot.
 * Animation freezing and reduced-motion emulation happen earlier, at the
 * context level in prepareContext(), so they're already in effect by the
 * time a page starts loading.
 */
export async function stabilizePage(page: Page, waitSelector?: string): Promise<void> {
  if (waitSelector) {
    await page.waitForSelector(waitSelector, { state: "visible" });
  }

  await page.evaluate(() => document.fonts.ready);
  await scrollThroughLazyImages(page);

  // The scroll pass can mount sections that start new webfont loads (icon
  // fonts in lazily-revealed content) - without a second wait those render
  // in the fallback font in the screenshot.
  await page.evaluate(() => document.fonts.ready);

  await page.waitForFunction(() => Array.from(document.images).every((img) => img.complete));

  // page.screenshot({ fullPage: true }) scrolls the page again internally to
  // stitch the capture together. On sites with scroll-triggered reveal
  // animations (e.g. Framer Motion's `whileInView`), that second scroll
  // re-fires the animations mid-capture. Our own pass above already visited
  // every section with a settle delay, so by now those animations should
  // have already reached their resting state and Playwright's internal
  // re-scroll won't have anything left to trigger.
  await page.waitForTimeout(300);
}

// The cap that makes the height re-read below safe. A page that *grows* as
// it is scrolled - an infinite feed, a "load more on scroll" list - can
// outrun scrollHeight for ever, and the loop lives inside a page.evaluate,
// which has no timeout of its own in Playwright. 40 viewport heights is far
// past anything worth diffing as one screenshot, and at 500 ms a step it
// keeps the whole pass well inside capture.ts's per-page deadline.
export const MAX_SCROLL_STEPS = 40;

// The page height is re-read from document.documentElement on every step, not
// snapshotted from document.body before the loop: body.scrollHeight misses
// pages that scroll on a wrapper (or whose body doesn't own the height), and a
// pre-loop snapshot never reaches content that lazily *grows* the page while
// the pass is running - both put Playwright's fullPage stitching scroll back
// in the position of first visitor, re-firing reveal animations mid-capture
// (the exact CLAUDE.md section 5.8 false positive).
export function buildScrollSettleScript(settleDelayMs: number, maxSteps: number = MAX_SCROLL_STEPS): string {
  return `(async () => {
  const step = window.innerHeight;
  const settle = ${settleDelayMs};
  const maxSteps = ${maxSteps};
  let steps = 0;
  for (let y = 0; y < document.documentElement.scrollHeight && steps < maxSteps; y += step) {
    window.scrollTo(0, y);
    steps++;
    await new Promise((resolve) => setTimeout(resolve, settle));
  }
  window.scrollTo(0, 0);
  await new Promise((resolve) => setTimeout(resolve, settle));
})()`;
}

async function scrollThroughLazyImages(page: Page): Promise<void> {
  await page.evaluate(buildScrollSettleScript(500));
}
