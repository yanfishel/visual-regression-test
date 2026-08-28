import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { db, pages, projectSchedules, runs, shots, viewports } from "@vrt/db";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { DeleteProjectDialog } from "@/components/delete-project-dialog";
import { QueuedRunWarning } from "@/components/live/queued-run-warning";
import { Pagination } from "@/components/pagination";
import { ProjectDialog, type ProjectDialogData } from "@/components/project-dialog";
import { RunButton } from "@/components/run-button";
import { RunShotSlider } from "@/components/run-shot-slider";
import { RunsTable } from "@/components/runs-table";
import { RunsToolbar } from "@/components/runs-toolbar";
import { ScheduleStatus } from "@/components/schedule-status";
import { SiteFavicon } from "@/components/site-favicon";
import { ViewportChip } from "@/components/viewport-chip";
import { hasRealEmail } from "@/lib/auth/email";
import { getCurrentUser } from "@/lib/auth/user";
import { findProjectForUser } from "@/lib/authz";
import { getMailConfigured } from "@/lib/mail-status";
import { paginate, parsePage } from "@/lib/pagination";
import {
  RUN_FILTER_QUERY_PARAM,
  RUN_FROM_QUERY_PARAM,
  RUN_PAGE_QUERY_PARAM,
  RUN_TO_QUERY_PARAM,
} from "@/lib/query-params";
import { getCaptureCounts } from "@/lib/run-capture-counts";
import { getComparisonCounts } from "@/lib/run-comparison-counts";
import { filterRunsByDate, parseDateRange } from "@/lib/run-date-range";
import { filterRuns, parseRunFilter } from "@/lib/run-filters";
import { buildRunSlides } from "@/lib/run-slides";
import { toScheduleDraft } from "@/lib/schedule-display";
import { getScheduleQuotaContexts } from "@/lib/schedule-quota";
import { getViewerTimeZone } from "@/lib/viewer-time-zone";
import { presetIdsOf } from "@/lib/viewport-selection";

export const dynamic = "force-dynamic";

// Sticky header cells for the scrolling page table. `sticky` on a
// border-collapse table pins the background but not the borders, so the
// bottom separator is an inset 1px shadow (an outer shadow doesn't paint on
// collapsed cells either); the first body row drops its own top border so
// the line isn't doubled while unscrolled.
const PAGE_TABLE_HEADER_CLASS =
  "sticky top-0 bg-surface pb-1 pr-4 font-bold shadow-[inset_0_-1px_0_0_theme(colors.border)]";

const RUNS_PAGE_SIZE = 10;

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId } = await params;
  const query = await searchParams;

  const user = await getCurrentUser();
  const project = await findProjectForUser(db, projectId, user);
  if (!project) {
    notFound();
  }

  // Ordered by creation so the summary and the edit dialog list pages and
  // viewports the same way on every render.
  const [projectPages, projectViewports, schedule, allRuns, latestFinishedRun] = await Promise.all([
    db.query.pages.findMany({
      where: eq(pages.projectId, projectId),
      orderBy: (page, { asc }) => asc(page.createdAt),
    }),
    db.query.viewports.findMany({
      where: eq(viewports.projectId, projectId),
      orderBy: (viewport, { asc }) => asc(viewport.createdAt),
    }),
    db.query.projectSchedules.findFirst({ where: eq(projectSchedules.projectId, projectId) }),
    // The whole history, newest first: the run table filters by outcome and
    // pages through it here, and the queued-run warning must see a stuck run
    // however deep it is buried. Retention keeps this bounded (CLAUDE.md
    // section 7).
    db.query.runs.findMany({
      where: eq(runs.projectId, projectId),
      orderBy: (run, { desc }) => desc(run.createdAt),
    }),
    // The slider previews the newest finished run - the newest run overall
    // may still be queued/running and have no shots to show yet.
    db.query.runs.findFirst({
      where: and(eq(runs.projectId, projectId), inArray(runs.status, ["done", "failed"])),
      orderBy: (run, { desc }) => desc(run.createdAt),
    }),
  ]);

  // Comparison counts for every run (one grouped query) - the outcome filter
  // needs each run's verdict before it can pick a page; capture counts only
  // for the runs actually shown.
  const [latestRunShots, comparisonCounts] = await Promise.all([
    latestFinishedRun ? db.query.shots.findMany({ where: eq(shots.runId, latestFinishedRun.id) }) : [],
    getComparisonCounts(allRuns.map((run) => run.id)),
  ]);
  const runFilter = parseRunFilter(query[RUN_FILTER_QUERY_PARAM]);
  const dateRange = parseDateRange(query[RUN_FROM_QUERY_PARAM], query[RUN_TO_QUERY_PARAM]);
  // The date bounds are calendar days as the viewer picked them, so they are
  // judged in the viewer's zone (UTC only for a cookie-less first request).
  const timeZone = (await getViewerTimeZone()) ?? "UTC";
  // Request time, captured once: ScheduleStatus's relative-time text is
  // computed from this rather than a client-side `new Date()`, or the
  // server-rendered HTML and the hydration pass would land on different
  // sides of a bucket boundary (lib/time-ago.ts documents the same
  // request-time convention).
  const now = new Date();
  // The dialog shows what a cadence costs before it is saved, so it needs
  // THIS PROJECT's allowance and what it already spent - the allowance is
  // spent per project (CLAUDE.md §12), sized by the owner's role but never
  // the viewer's (schedule-quota.ts) - an admin editing someone else's
  // project must see that project's own spend, not their own.
  const { limit: automatedRunLimit, used: automatedRunsUsed } = (
    await getScheduleQuotaContexts([{ id: project.id, ownerId: project.ownerId }], db, now)
  ).get(project.id) ?? { limit: null, used: 0 };
  const filteredRuns = filterRunsByDate(
    filterRuns(allRuns, comparisonCounts, runFilter),
    dateRange,
    timeZone,
  );
  const {
    items: pageRuns,
    page: runPage,
    pageCount: runPageCount,
  } = paginate(filteredRuns, parsePage(query[RUN_PAGE_QUERY_PARAM]), RUNS_PAGE_SIZE);
  const captureCounts = await getCaptureCounts(pageRuns.map((run) => run.id));
  const slides = buildRunSlides(latestRunShots, projectPages, projectViewports);

  // Pagination links carry the active filters along.
  function hrefForRunPage(target: number): string {
    const searchParams = new URLSearchParams();
    if (runFilter) {
      searchParams.set(RUN_FILTER_QUERY_PARAM, runFilter);
    }
    if (dateRange?.from) {
      searchParams.set(RUN_FROM_QUERY_PARAM, dateRange.from);
    }
    if (dateRange?.to) {
      searchParams.set(RUN_TO_QUERY_PARAM, dateRange.to);
    }
    if (target > 1) {
      searchParams.set(RUN_PAGE_QUERY_PARAM, String(target));
    }
    const suffix = searchParams.toString();
    return suffix ? `/projects/${projectId}?${suffix}` : `/projects/${projectId}`;
  }

  const canRun = projectPages.length > 0 && projectViewports.length > 0;
  // One run per project at a time (assertNoActiveRun): the Run button shows
  // the in-flight run's state instead of offering a click the action would
  // refuse. Newest first, so the first match is the current one.
  const activeRun = allRuns.find((run) => run.status === "queued" || run.status === "running");
  const activeRunStatus =
    activeRun?.status === "queued" ? "queued" : activeRun?.status === "running" ? "running" : null;
  const hasWaitSelectors = projectPages.some((page) => page.waitSelector);
  const hasMaskSelectors = projectPages.some((page) => page.maskSelectors.length > 0);

  // Everything about a project is edited in the dialog, so this page only
  // summarizes the configuration and lists runs - no inline controls.
  const dialogData: ProjectDialogData = {
    id: project.id,
    name: project.name,
    baseUrl: project.baseUrl,
    presetIds: presetIdsOf(projectViewports),
    pages: projectPages.map((page) => ({
      id: page.id,
      label: page.label,
      path: page.path,
      waitSelector: page.waitSelector ?? "",
      maskSelectors: page.maskSelectors.join(", "),
    })),
    schedule: toScheduleDraft(schedule ?? null),
    notifyOnFailure: project.notifyOnFailure,
  };

  // The notify toggle's two enabling facts (see /projects's page for the
  // same pair): the instance's SMTP config and the viewer's own address.
  const mailConfigured = getMailConfigured();
  const hasEmail = hasRealEmail(user);

  return (
    <main className="space-y-8">
      <div>
        <Breadcrumbs items={[{ label: "Projects", href: "/projects" }, { label: project.name }]} />
        <div className="mt-1 flex flex-wrap items-center justify-between gap-4">
          <h1 className="min-w-0 text-3xl font-extrabold tracking-tight">{project.name}</h1>
          <RunButton projectId={project.id} disabled={!canRun} activeRun={activeRunStatus} />
        </div>
        {!canRun && (
          <p className="mt-2 text-sm text-danger">Add at least one page and one viewport before running.</p>
        )}
        <QueuedRunWarning hasQueuedRun={allRuns.some((run) => run.status === "queued")} />
      </div>

      {/* The slider column is capped so the config card keeps most of the
          width; both stretch to the same row height. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <RunShotSlider projectId={project.id} runId={latestFinishedRun?.id ?? null} slides={slides} />

        {/* Body on top, action footer pinned to the bottom edge - the row
            stretches this card to the slider's height, and the footer
            follows the slider's own caption bar. */}
        <section className="panel flex min-w-0 flex-col overflow-hidden">
          {/* One rhythm for the whole body: base URL, viewport badges and
              the page table are separated by the same step. */}
          <div className="space-y-3 px-4 py-3.5">
            <div className="flex items-center gap-2">
              <SiteFavicon faviconKey={project.faviconKey} />
              <a
                href={project.baseUrl}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 break-all font-mono text-sm text-accent hover:underline"
              >
                {project.baseUrl}
              </a>
            </div>

            <h2 className="sr-only">Pages</h2>
            {projectPages.length === 0 ? (
              <p className="text-sm text-text-muted">No pages yet.</p>
            ) : (
              // The table is height-capped (a handful of rows) and scrolls
              // on its own: a project with dozens of pages must not stretch
              // the row (and the shot slider beside it) to screen height.
              // The header stays pinned while scrolling.
              <div className="max-h-36 overflow-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="text-xs font-bold uppercase tracking-wide text-text-faint">
                      <th className={PAGE_TABLE_HEADER_CLASS}>Page</th>
                      <th className={PAGE_TABLE_HEADER_CLASS}>Path</th>
                      {/* Optional per-page settings only earn a column when some
                        page actually uses them. */}
                      {hasWaitSelectors && <th className={PAGE_TABLE_HEADER_CLASS}>Wait</th>}
                      {hasMaskSelectors && <th className={PAGE_TABLE_HEADER_CLASS}>Masks</th>}
                    </tr>
                  </thead>
                  <tbody className="align-top">
                    {projectPages.map((page) => (
                      <tr key={page.id} className="border-t border-border first:border-t-0">
                        <td className="py-1 pr-4 font-medium">{page.label}</td>
                        <td className="py-1 pr-4 font-mono text-xs text-text-muted">{page.path}</td>
                        {hasWaitSelectors && (
                          <td className="py-1 pr-4 font-mono text-xs text-text-faint">
                            {page.waitSelector ?? ""}
                          </td>
                        )}
                        {hasMaskSelectors && (
                          <td className="py-1 font-mono text-xs text-text-faint">
                            {page.maskSelectors.join(", ")}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h2 className="sr-only">Viewports</h2>
            <div className="border-t border-border flex flex-wrap items-center gap-2 pt-3">
              {projectViewports.length === 0 ? (
                <span className="text-xs text-text-muted">no viewports</span>
              ) : (
                projectViewports.map((viewport) => <ViewportChip key={viewport.id} viewport={viewport} />)
              )}
            </div>

            {/* The schedule closes the configuration block - it is edited in
                the same dialog as the pages and viewports above it, so it
                lives with them rather than under the page title. Always
                rendered, "No schedule" included (ui.md "Scheduling"). */}
            <h2 className="sr-only">Schedule</h2>
            <ScheduleStatus
              projectId={project.id}
              viewerTimeZone={timeZone}
              schedule={
                schedule
                  ? {
                      runsPerDay: schedule.runsPerDay,
                      window: schedule.window,
                      timeZone: schedule.timeZone,
                      paused: schedule.paused,
                      // Dates are serialised for the client boundary; the
                      // component parses them back.
                      nextRunAt: schedule.nextRunAt.toISOString(),
                      lastRunAt: schedule.lastRunAt?.toISOString() ?? null,
                      lastSkippedAt: schedule.lastSkippedAt?.toISOString() ?? null,
                      lastSkipReason: schedule.lastSkipReason,
                      now: now.toISOString(),
                    }
                  : null
              }
            />
          </div>

          <div className="mt-auto flex items-center justify-end gap-2 border-t border-border px-4 py-2.5">
            <ProjectDialog
              project={dialogData}
              timeZone={timeZone}
              automatedRunLimit={automatedRunLimit}
              automatedRunsUsed={automatedRunsUsed}
              mailConfigured={mailConfigured}
              hasEmail={hasEmail}
            />
            <DeleteProjectDialog
              projectId={project.id}
              projectName={project.name}
              trigger="button"
              redirectToProjects
            />
          </div>
        </section>
      </div>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Runs</h2>
          {/* The toolbar only earns its place once there is a history to
              filter; a project with no runs at all shows the empty table
              alone. */}
          {allRuns.length > 0 && (
            <RunsToolbar filter={runFilter} range={dateRange} total={filteredRuns.length} />
          )}
        </div>
        <RunsTable
          projectId={project.id}
          runs={pageRuns}
          captureCounts={captureCounts}
          comparisonCounts={comparisonCounts}
          emptyMessage={
            runFilter || dateRange
              ? `No ${[runFilter, "runs", dateRange && "in this date range"].filter(Boolean).join(" ")}.`
              : "No runs yet."
          }
        />
        {runPageCount > 1 && (
          <div className="mt-4">
            <Pagination
              page={runPage}
              pageCount={runPageCount}
              hrefForPage={hrefForRunPage}
              label="Run pages"
            />
          </div>
        )}
      </section>
    </main>
  );
}
