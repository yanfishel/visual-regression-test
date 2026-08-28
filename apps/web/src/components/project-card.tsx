import Link from "next/link";
import type { Project } from "@vrt/db";
import { DeleteProjectDialog } from "@/components/delete-project-dialog";
import { CameraIcon } from "@/components/icons";
import { ProjectDialog, type ProjectDialogData } from "@/components/project-dialog";
import { RunOutcomePill } from "@/components/run-outcome-pill";
import { SchedulePill } from "@/components/schedule-pill";
import type { ProjectCardData } from "@/lib/project-cards";
import { describeRunFailure } from "@/lib/run-failure-details";
import { runOutcome } from "@/lib/run-outcome";
import { describeSchedulePill, toScheduleDraft } from "@/lib/schedule-display";
import { formatTimeAgo } from "@/lib/time-ago";
import { presetIdsOf } from "@/lib/viewport-selection";

// One project on /projects: a header bar with the project name and the
// edit/delete controls, then the newest finished run's first capture. The
// whole card links to the project; the controls sit above the stretched link.
export function ProjectCard({
  project,
  card,
  timeZone,
  automatedRunLimit,
  automatedRunsUsed,
  mailConfigured,
  hasEmail,
  now,
}: {
  project: Project;
  card: ProjectCardData;
  /** Viewer's IANA zone, resolved once on the /projects page. */
  timeZone: string;
  /** This project's own allowance and usage, not the viewer's - see schedule-quota.ts. */
  automatedRunLimit: number | null;
  automatedRunsUsed: number;
  /** Whether this instance can send e-mail and whether the viewer has an
   *  address - both resolved once on the /projects page and only used by the
   *  edit dialog's notify toggle. */
  mailConfigured: boolean;
  hasEmail: boolean;
  /** Request time, captured once on the page - the schedule pill's "next in
   *  N h" tooltip is computed from this, never a client-side `new Date()`
   *  (lib/time-ago.ts's force-dynamic convention). */
  now: Date;
}) {
  const dialogData: ProjectDialogData = {
    id: project.id,
    name: project.name,
    baseUrl: project.baseUrl,
    presetIds: presetIdsOf(card.viewports),
    pages: card.pages.map((page) => ({
      id: page.id,
      label: page.label,
      path: page.path,
      waitSelector: page.waitSelector ?? "",
      maskSelectors: page.maskSelectors.join(", "),
    })),
    schedule: toScheduleDraft(card.schedule),
    notifyOnFailure: project.notifyOnFailure,
  };

  return (
    <article className="group panel relative flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:border-accent hover:shadow-md">
      <Link href={`/projects/${project.id}`} aria-label={project.name} className="absolute inset-0 z-[1]" />

      {/* min-w-0 + truncate keep a long name to one ellipsized line instead
          of pushing the controls out of the bar. */}
      <div className="flex items-center justify-between gap-2 border-b border-border bg-surface-alt px-4 py-2">
        <h2 className="min-w-0 flex-1 truncate text-base font-bold tracking-tight transition-colors group-hover:text-accent">
          {project.name}
        </h2>
        <span className="relative z-10 flex shrink-0 items-center gap-0.5">
          <ProjectDialog
            project={dialogData}
            trigger="icon"
            timeZone={timeZone}
            automatedRunLimit={automatedRunLimit}
            automatedRunsUsed={automatedRunsUsed}
            mailConfigured={mailConfigured}
            hasEmail={hasEmail}
          />
          <DeleteProjectDialog projectId={project.id} projectName={project.name} />
        </span>
      </div>

      <div className="relative h-32 overflow-hidden border-b border-border bg-surface-alt">
        {card.previewStorageKey ? (
          <img
            src={`/api/shots/${card.previewStorageKey}`}
            alt={`Latest capture of ${project.name}`}
            loading="lazy"
            className="h-full w-full object-cover object-top"
          />
        ) : (
          <div className="landing-grid flex h-full flex-col items-center justify-center gap-2 text-text-faint">
            <CameraIcon className="h-6 w-6" />
            <span className="text-xs">No captures yet</span>
          </div>
        )}
        {/* Slight scrim over capture and placeholder alike, so bright pages
            don't outshine the card and the status pill stays readable. */}
        <span aria-hidden className="pointer-events-none absolute inset-0 bg-black/15" />
        {card.lastRun && (
          // The newest run overall; when it's finished it is also the newest
          // finished run, whose comparison result the card holds. No capture
          // counts here - describeRunFailure falls back to runs.error, which
          // carries the same "N of M captures failed" text.
          <RunOutcomePill
            outcome={runOutcome(card.lastRun.status, lastRunFailedComparisons(card) > 0)}
            details={describeRunFailure(card.lastRun, lastRunFailedComparisons(card))}
            // Above the card's stretched link (z-[1]) so the tooltip can open.
            className="absolute right-2 top-2 z-10 shadow-sm"
          />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 px-4 pb-3 pt-2.5">
        {/* Counts and cadence share one row: the pill's longest state
            ("Paused") still leaves room beside the widest realistic counts at
            the narrowest card (two columns from `sm`), and flex-wrap drops it
            back onto its own line rather than squeezing either one. */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <p className="font-mono text-xs text-text-faint">
            {card.pages.length} page{card.pages.length === 1 ? "" : "s"} &middot; {card.viewports.length}{" "}
            viewport
            {card.viewports.length === 1 ? "" : "s"}
          </p>

          {/* Cadence, not a run outcome - the neutral pill, never
              success/danger (CLAUDE.md §9). Always rendered, even with no
              schedule row at all ("Off"), so the feature stays discoverable.
              Flows with the rest of the footer rather than floating over the
              capture (like RunOutcomePill does). */}
          <SchedulePill {...describeSchedulePill(card.schedule, now)} />
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-2">
          <ResultSummary card={card} />
          {card.lastRun && (
            <span
              title={card.lastRun.createdAt.toISOString()}
              className="shrink-0 font-mono text-xs text-text-faint"
            >
              {formatTimeAgo(card.lastRun.createdAt)}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

// Failed comparisons of the card's newest run - only meaningful when that
// run is the finished one the result belongs to (an in-flight newest run has
// none yet).
function lastRunFailedComparisons(card: ProjectCardData): number {
  return card.lastRun && card.lastResult?.runId === card.lastRun.id ? card.lastResult.failed : 0;
}

// Outcome of the newest finished run, spelled out per status - color alone
// never carries the passed/failed distinction (CLAUDE.md §9).
function ResultSummary({ card }: { card: ProjectCardData }) {
  if (!card.lastResult) {
    return <span className="text-xs text-text-muted">No finished runs</span>;
  }
  const { passed, failed, unreviewed } = card.lastResult;
  const segments = [
    failed > 0 && (
      <span key="failed" className="font-semibold text-danger">
        {failed} failed
      </span>
    ),
    passed > 0 && (
      <span key="passed" className="text-success">
        {passed} passed
      </span>
    ),
    unreviewed > 0 && (
      <span key="new" className="text-text-muted">
        {unreviewed} new
      </span>
    ),
  ].filter(Boolean);

  if (segments.length === 0) {
    return <span className="text-xs text-text-muted">No comparisons</span>;
  }
  return <span className="flex min-w-0 flex-wrap items-center gap-x-2 font-mono text-xs">{segments}</span>;
}
