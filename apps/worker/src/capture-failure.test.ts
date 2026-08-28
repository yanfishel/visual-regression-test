import { describe, expect, it } from "vitest";
import { CaptureError, classifyCaptureError, cleanPlaywrightMessage } from "./capture-failure.js";

describe("cleanPlaywrightMessage", () => {
  it("strips ANSI escapes and the call log Playwright appends to navigation errors", () => {
    const raw =
      'page.goto: net::ERR_ABORTED at https://example.com/cv.pdf\nCall log:\n\x1b[2m  - navigating to "https://example.com/cv.pdf", waiting until "load"\x1b[22m\n';

    expect(cleanPlaywrightMessage(raw)).toBe("page.goto: net::ERR_ABORTED at https://example.com/cv.pdf");
  });

  it("leaves a plain message untouched", () => {
    expect(cleanPlaywrightMessage("Baseline file missing")).toBe("Baseline file missing");
  });
});

describe("classifyCaptureError", () => {
  it("keeps the kind and message of an error the capture loop raised itself", () => {
    const error = new CaptureError("http-error", "HTTP 404 Not Found");

    expect(classifyCaptureError(error)).toEqual({ kind: "http-error", message: "HTTP 404 Not Found" });
  });

  it("classifies DNS and connection failures as unreachable", () => {
    expect(
      classifyCaptureError(new Error("page.goto: net::ERR_NAME_NOT_RESOLVED at https://x.test/")).kind,
    ).toBe("unreachable");
    expect(
      classifyCaptureError(new Error("page.goto: net::ERR_CONNECTION_REFUSED at http://localhost/")).kind,
    ).toBe("unreachable");
    expect(
      classifyCaptureError(new Error("page.goto: net::ERR_CERT_AUTHORITY_INVALID at https://x/")).kind,
    ).toBe("unreachable");
  });

  it("classifies a navigation timeout as timeout", () => {
    const error = new Error(
      'page.goto: Timeout 30000ms exceeded.\nCall log:\n\x1b[2m  - navigating to "x"\x1b[22m',
    );

    expect(classifyCaptureError(error)).toEqual({
      kind: "timeout",
      message: "page.goto: Timeout 30000ms exceeded.",
    });
  });

  it("classifies a wait_selector that never showed up as selector-timeout", () => {
    const error = new Error(
      "page.waitForSelector: Timeout 30000ms exceeded.\nCall log:\n  - waiting for locator('#app')",
    );

    expect(classifyCaptureError(error).kind).toBe("selector-timeout");
  });

  it("falls back to other for anything unrecognised, keeping the cleaned message", () => {
    expect(classifyCaptureError(new Error("page.screenshot: Target closed"))).toEqual({
      kind: "other",
      message: "page.screenshot: Target closed",
    });
    expect(classifyCaptureError("boom")).toEqual({ kind: "other", message: "boom" });
  });
});
