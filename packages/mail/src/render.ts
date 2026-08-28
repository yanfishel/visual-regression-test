// Pure renderers - no transport, no DB - so the copy is unit-tested. Plain
// text is the primary body; the HTML twin is one column with inline styles
// and no images: the diffs are looked at in the app, the mail's job is to
// get someone there.

export interface RunFailedEmailInput {
  projectName: string;
  baseUrl: string;
  runUrl: string;
  finishedAt: Date;
  /** IANA zone of the project's schedule; the caller falls back to UTC. */
  timeZone: string;
  /** `runs.error` - "3 of 6 captures failed", a worker error, or null. */
  runError: string | null;
  failedComparisons: number;
  totalComparisons: number;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// "19 Aug 2026, 03:30 (Europe/Berlin)" - the zone spelled out, because the
// reader's mail client shows the message in *their* zone and the two can
// legitimately differ.
export function formatFinishedAt(finishedAt: Date, timeZone: string): string {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(finishedAt);
  return `${formatted} (${timeZone})`;
}

// Failed comparisons first (the thing this tool exists to catch), then what
// went wrong on the worker's side - same order as the run pill's tooltip
// (apps/web/src/lib/run-failure-details.ts).
export function describeFailureReasons(input: RunFailedEmailInput): string[] {
  const reasons: string[] = [];
  if (input.failedComparisons > 0) {
    reasons.push(`${input.failedComparisons} of ${input.totalComparisons} comparisons failed`);
  }
  if (input.runError) {
    reasons.push(input.runError.replace(/\s+/g, " ").trim());
  }
  return reasons.length > 0 ? reasons : ["Run failed"];
}

const FOOTER =
  "You're getting this because e-mail notifications are on for this project. Turn them off in the project's Schedule tab.";

export function renderRunFailedEmail(input: RunFailedEmailInput): RenderedEmail {
  const when = formatFinishedAt(input.finishedAt, input.timeZone);
  const reasons = describeFailureReasons(input);

  const text = [
    `Scheduled run failed: ${input.projectName}`,
    input.baseUrl,
    "",
    `Finished ${when}`,
    ...reasons.map((reason) => `- ${reason}`),
    "",
    `Open the run: ${input.runUrl}`,
    "",
    FOOTER,
  ].join("\n");

  const html = [
    `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.5;color:#1f2933;max-width:560px">`,
    `<h1 style="font-size:18px;margin:0 0 4px">Scheduled run failed: ${escapeHtml(input.projectName)}</h1>`,
    `<p style="margin:0 0 16px;color:#616e7c">${escapeHtml(input.baseUrl)}</p>`,
    `<p style="margin:0 0 8px">Finished ${escapeHtml(when)}</p>`,
    `<ul style="margin:0 0 16px;padding-left:20px">${reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>`,
    `<p style="margin:0 0 24px"><a href="${escapeHtml(input.runUrl)}" style="display:inline-block;padding:8px 14px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">Open the run</a><br><span style="font-size:13px;color:#616e7c">${escapeHtml(input.runUrl)}</span></p>`,
    `<p style="font-size:13px;color:#616e7c;margin:0">${escapeHtml(FOOTER)}</p>`,
    `</div>`,
  ].join("");

  return { subject: `[VRT] ${input.projectName}: scheduled run failed`, text, html };
}

export function renderTestEmail(input: { appUrl: string; to: string }): RenderedEmail {
  const line = `This is a test e-mail from the VRT instance at ${input.appUrl}. Notifications for your projects will arrive at ${input.to}.`;
  return {
    subject: "[VRT] Test e-mail",
    text: `${line}\n\nIf you did not expect this, someone entered your address in that instance's account menu.`,
    html: `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.5;color:#1f2933;max-width:560px"><p>${escapeHtml(line)}</p><p style="font-size:13px;color:#616e7c">If you did not expect this, someone entered your address in that instance's account menu.</p></div>`,
  };
}
