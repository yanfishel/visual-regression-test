import nodemailer from "nodemailer";
import { parseConnectionUrl } from "nodemailer/lib/shared/index.js";
import type { MailConfig } from "@vrt/shared/env";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

// Bounded timeouts, because every caller awaits send() inside the job that
// just finished a run (run-processor, reconcile, the scheduler's ticker) and
// the worker is concurrency: 1. Delivery is best-effort and must never block
// the run path: with nodemailer's defaults (connection 2 min, socket 10 min)
// a black-holed SMTP host would stall the single worker - and the live UI,
// which waits on the job's completion event - for minutes per run.
const CONNECTION_TIMEOUT_MS = 10_000;
const GREETING_TIMEOUT_MS = 10_000;
const SOCKET_TIMEOUT_MS = 30_000;

// The URL is expanded by nodemailer's own parser first: passing it as
// `{ url }` alongside the timeouts would silently drop them - createTransport
// replaces the whole options object with the parsed URL when `url` is present
// (nodemailer/lib/nodemailer.js). Exported for the unit test, which is the
// only way to see that the URL and the timeouts survive together.
export function smtpTransportOptions(smtpUrl: string) {
  return {
    ...parseConnectionUrl(smtpUrl),
    connectionTimeout: CONNECTION_TIMEOUT_MS,
    greetingTimeout: GREETING_TIMEOUT_MS,
    socketTimeout: SOCKET_TIMEOUT_MS,
  };
}

// One transport per config; nodemailer pools nothing by default, so this is
// a plain per-call SMTP session - fine for a notification a few times a day.
// Errors propagate: the caller decides whether a failed send matters (the
// worker logs and moves on).
export function createMailer(config: MailConfig): Mailer {
  const transport = nodemailer.createTransport(smtpTransportOptions(config.smtpUrl));
  return {
    async send(message) {
      await transport.sendMail({ from: config.from, ...message });
    },
  };
}
