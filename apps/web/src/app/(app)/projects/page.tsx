import { eq } from "drizzle-orm";
import { automatedRunLimitFor, db, projects } from "@vrt/db";
import { GitCompareArrowsIcon, SearchIcon } from "@/components/icons";
import { Pagination } from "@/components/pagination";
import { ProjectCard } from "@/components/project-card";
import { ProjectDialog } from "@/components/project-dialog";
import { ProjectsToolbar } from "@/components/projects-toolbar";
import { getCurrentUser } from "@/lib/auth/user";
import { getAuthMode } from "@/lib/auth/mode";
import { hasRealEmail } from "@/lib/auth/email";
import { isAdmin } from "@/lib/authz";
import { getMailConfigured } from "@/lib/mail-status";
import { getProjectCardData } from "@/lib/project-cards";
import { ALL_OWNERS_VALUE, getProjectOwners, parseOwnerFilter } from "@/lib/project-owners";
import { paginate, parsePage } from "@/lib/pagination";
import { filterProjects, parseProjectFilter } from "@/lib/project-filters";
import {
  NEW_PROJECT_QUERY_PARAM,
  PROJECT_FILTER_QUERY_PARAM,
  PROJECT_OWNER_QUERY_PARAM,
  PROJECT_PAGE_QUERY_PARAM,
  PROJECT_SEARCH_QUERY_PARAM,
} from "@/lib/query-params";
import { getRecentRuns } from "@/lib/recent-runs";
import { getCaptureCounts } from "@/lib/run-capture-counts";
import { getComparisonCounts } from "@/lib/run-comparison-counts";
import { getRunHistory } from "@/lib/run-history";
import { getScheduleQuotaContexts, type ScheduleQuotaContext } from "@/lib/schedule-quota";
import { getViewerTimeZone } from "@/lib/viewer-time-zone";
import { OwnerFilter } from "@/components/owner-filter";
import { RecentRunsPanel, WorkerStatusPanel } from "@/components/recent-activity";
import { RunsTimeline } from "@/components/runs-timeline";

const NO_QUOTA_LIMIT: ScheduleQuotaContext = { limit: null, used: 0 };

const PROJECTS_PAGE_SIZE = 6;

export const dynamic = "force-dynamic";

export const metadata = { title: "Projects" };

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  const query = await searchParams;

  // The owner filter is an admin-only view control over an otherwise
  // unrestricted list; for everyone else the scope is themselves and the
  // query param is ignored (lib/recent-runs.ts's resolveOwnerScope makes the
  // same call for the sidebar). It only exists in clerk mode - none mode has
  // exactly one user to filter by.
  const admin = isAdmin(user) && getAuthMode() === "clerk";
  const owners = admin ? await getProjectOwners(user) : [];
  const selectedOwner = admin
    ? parseOwnerFilter(
        query[PROJECT_OWNER_QUERY_PARAM],
        owners.map((owner) => owner.id),
        user.id,
      )
    : user.id;
  const ownerScope = selectedOwner === ALL_OWNERS_VALUE ? undefined : selectedOwner;
  const viewingSomeoneElse = admin && selectedOwner !== user.id;

  // The zone is the viewer's regardless of whose project this is - it is
  // when *they* are filling in the dialog. The quota context below is the
  // opposite: it must be each project's own spend, never the viewer's, or an
  // admin editing someone else's project would see that project's plan as
  // unlimited (schedule-quota.ts).
  const timeZone = (await getViewerTimeZone()) ?? "UTC";

  // The notify toggle's two enabling facts, resolved once for the whole page
  // rather than per card: whether the instance can send at all, and whether
  // the viewer has an address of their own (none mode starts without one).
  const mailConfigured = getMailConfigured();
  const hasEmail = hasRealEmail(user);

  // Request time, captured once: each card's schedule-pill tooltip ("next in
  // 14 h") is computed from this rather than a client-side `new Date()`, so
  // the server-rendered HTML and the hydration pass agree (lib/time-ago.ts
  // documents the same force-dynamic convention; the project page's
  // ScheduleStatus does the same for its own "now").
  const now = new Date();

  const [allProjects, recentRuns] = await Promise.all([
    db.query.projects.findMany({
      where: ownerScope ? eq(projects.ownerId, ownerScope) : undefined,
      orderBy: (project, { desc }) => desc(project.createdAt),
    }),
    getRecentRuns(db, user, { ownerId: ownerScope }),
  ]);
  const projectIds = allProjects.map((project) => project.id);
  // The timeline always covers every project the user can see - search and
  // filters below only narrow the cards, not the overview.
  const recentRunIds = recentRuns.map((run) => run.id);
  const [cardData, runHistory, captureCounts, comparisonCounts] = await Promise.all([
    getProjectCardData(projectIds),
    getRunHistory(projectIds),
    getCaptureCounts(recentRunIds),
    getComparisonCounts(recentRunIds),
  ]);

  const rawSearch = query[PROJECT_SEARCH_QUERY_PARAM];
  const search = typeof rawSearch === "string" ? rawSearch : "";
  const filter = parseProjectFilter(query[PROJECT_FILTER_QUERY_PARAM]);

  const filtered = filterProjects(allProjects, cardData, { query: search, filter });
  const {
    items: pageProjects,
    page,
    pageCount,
  } = paginate(filtered, parsePage(query[PROJECT_PAGE_QUERY_PARAM]), PROJECTS_PAGE_SIZE);

  // The dialog shows what a cadence costs before it is saved. Every visible
  // card's edit dialog needs THIS PROJECT's allowance and spend
  // (schedule-quota.ts), one batched call for the whole page rather than one
  // query per card (CLAUDE.md §9). The new-project dialog has no project yet
  // - a project created here is always the viewer's own, and spends nothing
  // until it exists, so its context is just the viewer's resolved limit.
  // Run alongside the batched card lookup rather than after it - both are
  // independent reads, and awaiting them one at a time would add a needless
  // sequential round trip.
  const [quotaByProjectId, viewerLimit] = await Promise.all([
    getScheduleQuotaContexts(
      pageProjects.map((project) => ({ id: project.id, ownerId: project.ownerId })),
      db,
      now,
    ),
    automatedRunLimitFor(db, user),
  ]);
  const viewerQuota: ScheduleQuotaContext = { limit: viewerLimit, used: 0 };

  // Pagination links carry the active search and filter along.
  function hrefForPage(target: number): string {
    const params = new URLSearchParams();
    if (admin) {
      params.set(PROJECT_OWNER_QUERY_PARAM, selectedOwner);
    }
    if (search.trim()) {
      params.set(PROJECT_SEARCH_QUERY_PARAM, search.trim());
    }
    if (filter) {
      params.set(PROJECT_FILTER_QUERY_PARAM, filter);
    }
    if (target > 1) {
      params.set(PROJECT_PAGE_QUERY_PARAM, String(target));
    }
    const suffix = params.toString();
    return suffix ? `/projects?${suffix}` : "/projects";
  }

  return (
    <main className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="font-mono text-xs uppercase tracking-wider text-text-faint">
            {allProjects.length} project{allProjects.length === 1 ? "" : "s"}
          </span>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Projects</h1>
          <p className="mt-1 max-w-prose text-text-muted">
            Pick a project to review its latest run, or add a new site to start tracking.
          </p>
        </div>
        <ProjectDialog
          initialOpen={query[NEW_PROJECT_QUERY_PARAM] !== undefined}
          timeZone={timeZone}
          automatedRunLimit={viewerQuota.limit}
          automatedRunsUsed={viewerQuota.used}
          mailConfigured={mailConfigured}
          hasEmail={hasEmail}
        />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="space-y-6">
          {allProjects.length === 0 ? (
            <div className="panel landing-grid flex flex-col items-center gap-3 px-6 py-14 text-center">
              <GitCompareArrowsIcon className="h-8 w-8 text-text-faint" />
              {/* An admin looking at somebody else's empty list is not being
                  invited to add a site on their behalf. */}
              <p className="font-semibold">
                {viewingSomeoneElse ? "No projects for this owner" : "No projects yet"}
              </p>
              {!viewingSomeoneElse && (
                <p className="max-w-xs text-sm text-text-muted">
                  Add a site to start capturing screenshots and catching visual regressions.
                </p>
              )}
            </div>
          ) : (
            <>
              <ProjectsToolbar
                query={search}
                filter={filter}
                total={filtered.length}
                owner={admin ? selectedOwner : undefined}
              />
              {filtered.length === 0 ? (
                <div className="panel flex flex-col items-center gap-3 px-6 py-12 text-center">
                  <SearchIcon className="h-6 w-6 text-text-faint" />
                  <p className="font-semibold">No projects match</p>
                  <p className="max-w-xs text-sm text-text-muted">
                    Try a different search or switch the filter back to All.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {pageProjects.map((project) => {
                    const card = cardData.get(project.id);
                    const projectQuota = quotaByProjectId.get(project.id) ?? NO_QUOTA_LIMIT;
                    return (
                      card && (
                        <ProjectCard
                          key={project.id}
                          project={project}
                          card={card}
                          timeZone={timeZone}
                          automatedRunLimit={projectQuota.limit}
                          automatedRunsUsed={projectQuota.used}
                          mailConfigured={mailConfigured}
                          hasEmail={hasEmail}
                          now={now}
                        />
                      )
                    );
                  })}
                </div>
              )}
              <Pagination page={page} pageCount={pageCount} hrefForPage={hrefForPage} />
            </>
          )}
        </div>

        <aside className="space-y-5">
          {admin && <OwnerFilter owners={owners} selected={selectedOwner} viewerId={user.id} />}
          <RunsTimeline history={runHistory} />
          <RecentRunsPanel
            runs={recentRuns}
            captureCounts={captureCounts}
            comparisonCounts={comparisonCounts}
          />
          <WorkerStatusPanel />
        </aside>
      </div>
    </main>
  );
}
