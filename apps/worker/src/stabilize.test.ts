import { afterEach, describe, expect, it, vi } from "vitest";
import type { BrowserContext } from "playwright";
import { buildScrollSettleScript, FREEZE_TIME_AND_RANDOM, prepareContext } from "./stabilize.js";

function runFreezeScript(): { now: () => number } {
  const window: { Date?: { now: () => number } } = {};
  const run = new Function("window", FREEZE_TIME_AND_RANDOM);
  run(window);
  return window.Date!;
}

describe("FREEZE_TIME_AND_RANDOM", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("freezes Date.now() to the same value across runs on different real days", () => {
    vi.useFakeTimers();

    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
    const first = runFreezeScript().now();

    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
    const second = runFreezeScript().now();

    expect(second).toBe(first);
  });
});

describe("buildScrollSettleScript", () => {
  it("re-reads the page height each step so content that lazily grows the page is still reached", async () => {
    const visited: number[] = [];
    // The page starts 300px tall; once the pass scrolls to 200, lazy content
    // mounts and grows it to 400. A height snapshot taken before the loop
    // would stop at 200 and never visit the new section.
    const documentElement = { scrollHeight: 300 };
    const window = {
      innerHeight: 100,
      scrollTo: (_x: number, y: number) => {
        visited.push(y);
        if (y === 200) {
          documentElement.scrollHeight = 400;
        }
      },
    };
    // body.scrollHeight is 0 on pages that scroll on a wrapper element -
    // documentElement.scrollHeight must be the one consulted.
    const document = { documentElement, body: { scrollHeight: 0 } };

    const run = new Function("window", "document", `return ${buildScrollSettleScript(0)}`);
    await run(window, document);

    expect(visited).toEqual([0, 100, 200, 300, 0]);
  });
});

describe("prepareContext", () => {
  it("registers an init script that kills CSS animations without using document.write", async () => {
    const registeredScripts: string[] = [];
    const fakeContext = {
      addInitScript: vi.fn(async (script: string) => {
        registeredScripts.push(script);
      }),
      route: vi.fn(async () => {}),
    } as unknown as BrowserContext;

    await prepareContext(fakeContext);

    // document.write() at init-script time reliably hung real navigation
    // (confirmed against a real page in Docker - page.goto() timed out
    // waiting for 'load'). This fake DOM simulates the document not having
    // a <head> yet when the init script first runs, to prove the injected
    // script waits (via MutationObserver) instead of calling document.write.
    let observerCallback: (() => void) | undefined;
    class FakeMutationObserver {
      constructor(callback: () => void) {
        observerCallback = callback;
      }
      observe(): void {}
      disconnect(): void {}
    }
    const head = { appendChild: vi.fn() };
    const document: {
      head: typeof head | null;
      documentElement: null;
      createElement: (tag: string) => object;
    } = {
      head: null,
      documentElement: null,
      createElement: (tag: string) => ({ tagName: tag, textContent: "" }),
    };

    for (const script of registeredScripts) {
      const run = new Function("document", "window", "MutationObserver", script);
      run(document, {}, FakeMutationObserver);
    }

    expect(head.appendChild).not.toHaveBeenCalled();
    expect(observerCallback).toBeTypeOf("function");

    // <head> becomes available (the parser reached it) - the observer fires.
    document.head = head;
    observerCallback?.();

    expect(head.appendChild).toHaveBeenCalledTimes(1);
    const styleEl = head.appendChild.mock.calls[0]?.[0] as { textContent: string };
    expect(styleEl.textContent).toContain("animation-duration: 0s");
  });
});
