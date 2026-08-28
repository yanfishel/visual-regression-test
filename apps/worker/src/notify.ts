import { and, count, desc, eq, inArray, lt } from "drizzle-orm";
import { createMailer, renderRunFailedEmail, type Mailer } from "@vrt/mail";
import { comparisons, db, runs, shots, type Database } from "@vrt/db";
import { mailConfigFrom } from "@vrt/shared/env";
import type { RunStatus, RunTrigger } from "@vrt/shared/constants";
import { runOutcome, type RunOutcome } from "@vrt/shared/run-outcome";

// E-mail notifications (CLAUDE.md §4 "Notifications"). The worker is the only
// sender: it is where a run becomes terminal. Everything here is best-effort
// - a failed send is logged and forgotten; the run history, not a mail log,
// is the source of truth.

/**
 * The one rule. `previousOutcome` is the project's most recent *finished*
 * run before this one, evaluated *now* (its comparisons as they stand): once
 * that run's diffs are approved it reads as passed and the next failure
 * notifies again. So this is "one e-mail per new failure", with the
 * approval model doubling as the acknowledgement. Manual runs never notify -
 * the person who pressed Run is looking at the screen.
 */
export function shouldNotifyRunFailure(input: {
  trigger: RunTrigger;
  notifyOnFailure: boolean;
  outcome: RunOutcome;
  previousOutcome: RunOutcome | null;
}): boolean {
  if (input.trigger === "manual" || !input.notifyOnFailure || input.outcome !== "failed") {
    return false;
  }
  return input.previousOutcome !== "failed";
}

/** Exactly the run fields the notification needs - see `loadRun` below. */
export interface RunForNotification {
  id: string;
  projectId: string;
  trigger: RunTrigger;
  status: RunStatus;
  error: string | null;
  createdAt: Date;
  finishedAt: Date | null;
  project: {
    name: string;
    baseUrl: string;
    notifyOnFailure: boolean;
    owner: { email: string };
    schedule: { timeZone: string } | null;
  } | null;
}

export interface ComparisonTally {
  failed: number;
  total: number;
}

/**
 * The DB reads are deps rather than one injected `Database` so the tests can
 * stub three small functions instead of faking drizzle's query builder - the
 * fake would only ever assert against itself. All three default to the real
 * thing.
 */
export interface NotifyDeps {
  loadRun?: (runId: string) => Promise<RunForNotification | null>;
  failedComparisonCount?: (runId: string) => Promise<ComparisonTally>;
  previousFinishedOutcome?: (projectId: string, before: Date) => Promise<RunOutcome | null>;
  /** `null` = don't send (mail off); `undefined` = build one from the env. */
  mailer?: Mailer | null;
  env?: Record<string, string | undefined>;
}

export async function loadRun(database: Database, runId: string): Promise<RunForNotification | null> {
  const run = await database.query.runs.findFirst({
    where: eq(runs.id, runId),
    with: { project: { with: { owner: true, schedule: true } } },
  });
  return run ?? null;
}

export async function failedComparisonCount(database: Database, runId: string): Promise<ComparisonTally> {
  const rows = await database
    .select({ status: comparisons.status, value: count() })
    .from(comparisons)
    .innerJoin(shots, eq(comparisons.shotId, shots.id))
    .where(eq(shots.runId, runId))
    .groupBy(comparisons.status);
  let failed = 0;
  let total = 0;
  for (const row of rows) {
    total += row.value;
    if (row.status === "failed") failed += row.value;
  }
  return { failed, total };
}

export async function previousFinishedOutcome(
  database: Database,
  projectId: string,
  before: Date,
): Promise<RunOutcome | null> {
  const previous = await database.query.runs.findFirst({
    where: and(
      eq(runs.projectId, projectId),
      lt(runs.createdAt, before),
      inArray(runs.status, ["done", "failed"]),
    ),
    orderBy: [desc(runs.createdAt)],
    columns: { id: true, status: true },
  });
  if (!previous) return null;
  const { failed } = await failedComparisonCount(database, previous.id);
  return runOutcome(previous.status, failed > 0);
}

let unconfiguredLogged = false;

function resolveMailer(deps: NotifyDeps): { mailer: Mailer; appUrl: string } | null {
  const config = mailConfigFrom(deps.env ?? process.env);
  if (!config) {
    if (!unconfiguredLogged) {
      console.log("E-mail notifications are off: SMTP_URL and MAIL_FROM are not set");
      unconfiguredLogged = true;
    }
    return null;
  }
  return { mailer: deps.mailer ?? createMailer(config), appUrl: config.appUrl };
}

/**
 * Called from every place a run turns terminal in the worker (run-processor
 * after done / capture-failed / thrown; reconcile for lost runs). Never
 * throws: notification is a side effect of a run, not part of it.
 */
export async function notifyRunFinished(runId: string, deps: NotifyDeps = {}): Promise<void> {
  try {
    // Mail first: with notifications off there is nothing to read the DB for.
    const transport = deps.mailer === null ? null : resolveMailer(deps);
    if (!transport) return;

    const readRun = deps.loadRun ?? ((id: string) => loadRun(db, id));
    const readTally = deps.failedComparisonCount ?? ((id: string) => failedComparisonCount(db, id));
    const readPrevious =
      deps.previousFinishedOutcome ??
      ((projectId: string, before: Date) => previousFinishedOutcome(db, projectId, before));

    const run = await readRun(runId);
    if (!run || !run.project || run.trigger === "manual" || !run.project.notifyOnFailure) return;
    if (run.status !== "done" && run.status !== "failed") return;

    const tally = await readTally(runId);
    const outcome = runOutcome(run.status, tally.failed > 0);
    const previousOutcome = await readPrevious(run.projectId, run.createdAt);
    if (
      !shouldNotifyRunFailure({
        trigger: run.trigger,
        notifyOnFailure: run.project.notifyOnFailure,
        outcome,
        previousOutcome,
      })
    ) {
      return;
    }

    const message = renderRunFailedEmail({
      projectName: run.project.name,
      baseUrl: run.project.baseUrl,
      runUrl: `${transport.appUrl}/projects/${run.projectId}/runs/${run.id}`,
      finishedAt: run.finishedAt ?? new Date(),
      timeZone: run.project.schedule?.timeZone ?? "UTC",
      runError: run.error,
      failedComparisons: tally.failed,
      totalComparisons: tally.total,
    });
    await transport.mailer.send({ to: run.project.owner.email, ...message });
    console.log(`Notified ${run.project.owner.email} about failed run ${runId}`);
  } catch (error) {
    console.error(`Notification for run ${runId} failed:`, error);
  }
}
