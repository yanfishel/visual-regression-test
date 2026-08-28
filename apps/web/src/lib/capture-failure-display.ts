import type { CaptureFailureKind } from "@vrt/shared/constants";

// Short name for the card line; the raw message follows it.
export const CAPTURE_FAILURE_LABEL: Record<CaptureFailureKind, string> = {
  "not-html": "Not a web page",
  "http-error": "HTTP error",
  unreachable: "Unreachable",
  timeout: "Timed out",
  "selector-timeout": "Wait selector not found",
  other: "Capture error",
};

// What to do about it - shown in the details popover under the raw message.
export const CAPTURE_FAILURE_HINT: Record<CaptureFailureKind, string> = {
  "not-html":
    "The URL answered with a document the browser can't render as a page (a PDF, an image, a download). Only HTML pages can be captured - check the path, or remove this page from the project.",
  "http-error":
    "The server answered with an error status. A 404 usually means the path is wrong or the page moved; a 401/403 means the site needs a login the worker doesn't have.",
  unreachable:
    "The browser couldn't reach the host at all - DNS, connection or TLS failure. Check the base URL, and whether the site is up and reachable from where the worker runs.",
  timeout:
    "The page didn't finish loading within the navigation timeout. If it's just slow, re-run; if it never settles (endless polling, a hung request), set a wait selector so the capture doesn't depend on the load event.",
  "selector-timeout":
    "The page loaded, but its wait selector never became visible. Check the selector against the live page - it may have been renamed or removed.",
  other:
    "Something failed while loading, stabilizing or screenshotting the page. The message has the details.",
};
