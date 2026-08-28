import { afterEach, describe, expect, it, vi } from "vitest";
import type { MailMessage } from "@vrt/mail";
import type { RunOutcome } from "@vrt/shared/run-outcome";
import { notifyRunFinished, shouldNotifyRunFailure, type RunForNotification } from "./notify.js";

const on = { trigger: "schedule" as const, notifyOnFailure: true, outcome: "failed" as const };

describe("shouldNotifyRunFailure", () => {
  it("notifies a failed scheduled run when the previous finished run is not failed", () => {
    expect(shouldNotifyRunFailure({ ...on, previousOutcome: "passed" })).toBe(true);
  });

  it("notifies the very first run of a project (no previous run to suppress it)", () => {
    expect(shouldNotifyRunFailure({ ...on, previousOutcome: null })).toBe(true);
  });

  it("stays quiet while the previous run is still failed - one e-mail per failure, not per run", () => {
    expect(shouldNotifyRunFailure({ ...on, previousOutcome: "failed" })).toBe(false);
  });

  it("never notifies a manual run", () => {
    expect(shouldNotifyRunFailure({ ...on, trigger: "manual", previousOutcome: "passed" })).toBe(false);
  });

  it("does nothing when the project has notifications off", () => {
    expect(shouldNotifyRunFailure({ ...on, notifyOnFailure: false, previousOutcome: "passed" })).toBe(false);
  });

  it("does nothing for a run that passed", () => {
    expect(shouldNotifyRunFailure({ ...on, outcome: "passed", previousOutcome: "failed" })).toBe(false);
  });

  it("would cover webhook runs when they exist - the rule is 'not manual'", () => {
    expect(shouldNotifyRunFailure({ ...on, trigger: "webhook", previousOutcome: null })).toBe(true);
  });
});

const MAIL_ENV = { SMTP_URL: "smtp://x", MAIL_FROM: "a@b", APP_URL: "http://app" };

const scheduledFailedRun: RunForNotification = {
  id: "r2",
  projectId: "p1",
  trigger: "schedule",
  status: "failed",
  error: "1 of 2 captures failed",
  createdAt: new Date("2026-08-19T00:10:00Z"),
  finishedAt: new Date("2026-08-19T00:12:00Z"),
  project: {
    name: "Site",
    baseUrl: "https://example.com",
    notifyOnFailure: true,
    owner: { email: "me@example.com" },
    schedule: { timeZone: "UTC" },
  },
};

// The three DB reads are stubbed as functions (see NotifyDeps): what is
// under test is the decision and the message, not drizzle's query builder.
function dbDeps(previousOutcome: RunOutcome | null, run: RunForNotification = scheduledFailedRun) {
  return {
    loadRun: vi.fn(async () => run),
    failedComparisonCount: vi.fn(async () => ({ failed: 1, total: 2 })),
    previousFinishedOutcome: vi.fn(async () => previousOutcome),
  };
}

describe("notifyRunFinished", () => {
  // The function logs on every path it is asked to take here; without the
  // spies the suite's output is the worker's, not the test runner's.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends one e-mail to the owner for a fresh scheduled failure", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const send = vi.fn(async (_message: MailMessage) => {});
    await notifyRunFinished("r2", { ...dbDeps("passed"), mailer: { send }, env: MAIL_ENV });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      to: "me@example.com",
      subject: "[VRT] Site: scheduled run failed",
    });
    expect(send.mock.calls[0]?.[0].text).toContain("http://app/projects/p1/runs/r2");
  });

  it("stays quiet when the previous run is still failed", async () => {
    const send = vi.fn(async (_message: MailMessage) => {});
    await notifyRunFinished("r2", { ...dbDeps("failed"), mailer: { send }, env: MAIL_ENV });
    expect(send).not.toHaveBeenCalled();
  });

  it("does nothing when mail is not configured", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const send = vi.fn(async (_message: MailMessage) => {});
    const deps = dbDeps("passed");
    await notifyRunFinished("r2", { ...deps, mailer: { send }, env: {} });
    expect(send).not.toHaveBeenCalled();
    expect(deps.loadRun).not.toHaveBeenCalled();
  });

  it("swallows a throwing mailer and logs it instead", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const send = vi.fn(async (_message: MailMessage) => {
      throw new Error("SMTP down");
    });
    await expect(
      notifyRunFinished("r2", { ...dbDeps(null), mailer: { send }, env: MAIL_ENV }),
    ).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
    // A swallowed error that isn't logged is a silent failure - the log line
    // is the only trace a failed send leaves anywhere.
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]?.[0]).toBe("Notification for run r2 failed:");
    expect(logSpy).not.toHaveBeenCalled();
  });
});
