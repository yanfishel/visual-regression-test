import type { CaptureFailureKind } from "@vrt/shared";
import { DeadlineError } from "./deadline.js";

/**
 * A capture failure the loop detects itself (a 404 answer, a PDF instead of a
 * page) rather than one Playwright throws - already classified, so the catch
 * block keeps its kind instead of guessing from the message.
 */
export class CaptureError extends Error {
  constructor(
    readonly kind: CaptureFailureKind,
    message: string,
  ) {
    super(message);
    this.name = "CaptureError";
  }
}

// Playwright decorates thrown errors with a multi-line "Call log:" wrapped in
// ANSI dim codes - useful in a terminal, noise (and literal escape bytes) in
// a database column rendered on a web page.
export function cleanPlaywrightMessage(raw: string): string {
  // The escape byte is the whole point of this regex.
  // eslint-disable-next-line no-control-regex
  const withoutAnsi = raw.replace(/\x1b\[[0-9;]*m/g, "");
  const callLogAt = withoutAnsi.indexOf("\nCall log:");
  return (callLogAt === -1 ? withoutAnsi : withoutAnsi.slice(0, callLogAt)).trim();
}

// Chromium's net error codes for "never got an answer from the host": name
// resolution, TCP connect, TLS handshake. ERR_ABORTED is deliberately absent -
// that one is what a navigation-turned-download reports and the capture loop
// probes it further before deciding.
const UNREACHABLE_PATTERN =
  /net::ERR_(NAME_NOT_RESOLVED|NAME_RESOLUTION_FAILED|CONNECTION_\w+|ADDRESS_UNREACHABLE|INTERNET_DISCONNECTED|NETWORK_CHANGED|TIMED_OUT|CERT_\w+|SSL_\w+)/;

export function classifyCaptureError(error: unknown): { kind: CaptureFailureKind; message: string } {
  if (error instanceof CaptureError) {
    return { kind: error.kind, message: error.message };
  }
  // Our own watchdog (deadline.ts), not Playwright's - it fires precisely
  // where Playwright would never have thrown at all, so there is no
  // "Timeout" in any message for the pattern below to recognise.
  if (error instanceof DeadlineError) {
    return { kind: "timeout", message: error.message };
  }

  const message = cleanPlaywrightMessage(error instanceof Error ? error.message : String(error));

  if (UNREACHABLE_PATTERN.test(message)) {
    return { kind: "unreachable", message };
  }
  if (/\bTimeout\b/.test(message)) {
    // Playwright prefixes messages with the API that threw, which is the only
    // way to tell "the page never loaded" from "the page loaded but the
    // configured wait_selector never appeared".
    return { kind: message.startsWith("page.waitForSelector") ? "selector-timeout" : "timeout", message };
  }
  return { kind: "other", message };
}
