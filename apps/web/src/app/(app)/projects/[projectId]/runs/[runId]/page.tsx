import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@vrt/db";
import { ApproveAllDialog } from "@/components/approve-all-dialog";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CaptureFailureCard } from "@/components/capture-failure-card";
import { RunProgress } from "@/components/live/run-progress";
import { LocalTime } from "@/components/local-time";
import { RunOutcomePill } from "@/components/run-outcome-pill";
import { ViewportChip } from "@/components/viewport-chip";
import { isPendingApproval } from "@/lib/approve-comparisons";
import { getCurrentUser } from "@/lib/auth/user";
import { findProjectForUser } from "@/lib/authz";
import { COMPARISON_STATUS_CLASS } from "@/lib/comparison-status";
import { formatDiffScore } from "@/lib/diff-score";
import { formatRegionSummary, parseRegionReport } from "@/lib/region-report";
import { describeRunFailure } from "@/lib/run-failure-details";
import { runOutcome } from "@/lib/run-outcome";
import { buildRunGrid, getRunResultData, groupRunGrid, type GridCard } from "./data.js";

export const dynamic = "force-dynamic";

export default async function RunPage({ params }: { params: Promise<{ projectId: string; runId: string }> }) {
  const { projectId, runId } = await params;

  const user = await getCurrentUser();
  const project = await findProjectForUser(db, projectId, user);
  if (!project) {
    notFound();
  }

  const data = await getRunResultData(runId, projectId);
  if (!data) {
    notFound();
  }
  const { run, rows, failures } = data;
  const groups = groupRunGrid(buildRunGrid(rows, failures));
  const failedComparisons = rows.filter((row) => row.comparison?.status === "failed").length;
  const outcome = runOutcome(run.status, failedComparisons > 0);
  const details = describeRunFailure(run, failedComparisons, {
    captured: rows.length,
    failed: failures.length,
  });

  // Bulk approve only once the worker is through: a running run's grid is
  // still filling in, and "approve all" of half a run isn't what the button
  // says.
  const finished = run.status === "done" || run.status === "failed";
  const groupSummaries = groups.map((group) => ({
    label: group.page?.label ?? "Deleted page",
    pending: countPending(group.cards),
  }));
  const pendingTotal = groupSummaries.reduce((sum, group) => sum + group.pending, 0);

  return (
    <main className="space-y-6">
      <div>
        <Breadcrumbs
          items={[
            { label: "Projects", href: "/projects" },
            { label: project.name, href: `/projects/${projectId}` },
            { label: <LocalTime date={run.createdAt} /> },
          ]}
        />
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight">
              <LocalTime date={run.createdAt} />
            </h1>
            <p className="mt-1 font-mono text-xs text-text-faint">Run {run.id}</p>
          </div>
          <RunOutcomePill outcome={outcome} details={details} className="mt-2 shrink-0" />
        </div>
      </div>

      {run.status === "failed" && (
        <RunFailureNotice run={run} captured={rows.length} failed={failures.length} />
      )}

      <RunProgress runId={run.id} initialStatus={run.status} />

      {/* One section per page (label order - what `buildRunGrid` sorts by,
          and what the comparison viewer's prev/next walks): the heading names
          the page, so each card's title is its viewport chip alone. */}
      {groups.map((group, index) => {
        const summary = groupSummaries[index]!;
        return (
          <section key={group.page?.id ?? "deleted"} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-base font-bold tracking-tight">{summary.label}</h2>
                {group.page && <span className="font-mono text-xs text-text-faint">{group.page.path}</span>}
                <span className="text-sm text-text-muted">{describeGroup(group.cards)}</span>
              </div>
              {finished && (
                <ApproveAllDialog
                  runId={run.id}
                  pageId={group.page?.id}
                  pending={group.page ? summary.pending : 0}
                  scope={`of ${summary.label}`}
                  variant="group"
                />
              )}
            </div>
            {/* Full-page captures are arbitrarily tall, so each card shows a
                fixed-height crop of the top of the shot - the full image
                belongs to the comparison viewer, not to this overview grid. */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.cards.map((card) => {
                if (card.kind === "failure") {
                  const { failure } = card;
                  return (
                    <CaptureFailureCard
                      key={failure.id}
                      viewport={failure.viewport}
                      kind={failure.kind}
                      message={failure.message}
                    />
                  );
                }

                const { row } = card;
                const regionSummary = row.comparison
                  ? formatRegionSummary(parseRegionReport(row.comparison.regionReport))
                  : null;
                const shotCard = (
                  <>
                    <div className="relative h-44 overflow-hidden border-b border-border bg-surface-alt">
                      <img
                        src={`/api/shots/${row.storageKey}`}
                        alt={`${row.page?.label} @ ${row.viewport?.label}`}
                        loading="lazy"
                        className="h-full w-full object-cover object-top"
                      />
                      {/* Same slight scrim as the project card's preview: most
                          sites are white on a white card, and without it the
                          crop read as if it continued into the title row. */}
                      <span aria-hidden className="pointer-events-none absolute inset-0 bg-black/15" />
                    </div>
                    {/* Title row: the viewport as plain icon + text (the
                        status pill is the row's one pill), truncating before
                        it can push the pill out. */}
                    <div className="flex items-baseline justify-between gap-2 px-3 py-2.5">
                      {row.viewport ? (
                        <ViewportChip viewport={row.viewport} plain />
                      ) : (
                        <span className="text-sm text-text-muted">Deleted viewport</span>
                      )}
                      <span
                        className={`pill shrink-0 ${COMPARISON_STATUS_CLASS[row.comparison?.status ?? "new"] ?? "pill-new"}`}
                      >
                        {/* A shot without a comparison row hasn't been diffed
                            (yet) - same situation "new" describes, and it's
                            what the pill class fallback already assumes. */}
                        {row.comparison?.status ?? "new"}
                        {row.comparison?.diffScore != null
                          ? ` ${formatDiffScore(row.comparison.diffScore, 2)}`
                          : ""}
                      </span>
                    </div>
                    {/* Which blocks changed, when the worker could tell - a
                        card without a region report (pre-feature baseline,
                        failed scan) looks exactly as before. */}
                    {regionSummary && (
                      <div className="-mt-1 px-3 pb-2.5 text-xs text-text-muted">{regionSummary}</div>
                    )}
                  </>
                );

                return row.comparison ? (
                  <Link
                    key={row.shotId}
                    href={`/projects/${projectId}/runs/${runId}/comparisons/${row.comparison.id}`}
                    className="panel block overflow-hidden transition hover:-translate-y-0.5 hover:border-accent hover:shadow-md"
                  >
                    {shotCard}
                  </Link>
                ) : (
                  <div key={row.shotId} className="panel overflow-hidden">
                    {shotCard}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      {groups.length === 0 && (
        <p className="text-text-muted">No shots yet - the run may still be in progress.</p>
      )}

      {/* Whole-run approve sits under the grid: it's the action to take
          after reviewing everything above, not before. */}
      {finished && pendingTotal > 0 && (
        <div className="flex items-center justify-end gap-3 border-t border-border pt-5">
          <span className="text-sm text-text-muted">
            {pendingTotal} {pendingTotal === 1 ? "comparison" : "comparisons"} pending
          </span>
          <ApproveAllDialog
            runId={run.id}
            pending={pendingTotal}
            scope="in this run"
            breakdown={groupSummaries.filter((group) => group.pending > 0)}
            variant="run"
          />
        </div>
      )}
    </main>
  );
}

// Comparisons the group's "Approve N" would move - the same rule the action
// applies (`PENDING_APPROVAL_STATUSES`: failed diffs and pairs with no
// baseline yet; a passed run has nothing to approve, so shows no buttons).
// A shot with no comparison row hasn't been diffed and can't be approved.
function countPending(cards: GridCard[]): number {
  return cards.filter(
    (card) => card.kind === "shot" && card.row.comparison && isPendingApproval(card.row.comparison.status),
  ).length;
}

// "3 viewports · 2 failed · 1 not captured" - the group heading's figures;
// the zero parts are left out.
function describeGroup(cards: GridCard[]): string {
  const failed = cards.filter(
    (card) => card.kind === "shot" && card.row.comparison?.status === "failed",
  ).length;
  const notCaptured = cards.filter((card) => card.kind === "failure").length;
  const parts = [`${cards.length} ${cards.length === 1 ? "viewport" : "viewports"}`];
  if (failed > 0) {
    parts.push(`${failed} failed`);
  }
  if (notCaptured > 0) {
    parts.push(`${notCaptured} not captured`);
  }
  return parts.join(" · ");
}

// Why the run is `failed`, in a sentence: a partial capture ("3 of 6 captures
// failed" - the missing pairs are cards in the grid below with their reason)
// or a whole-run error from the worker, whose message is all we have.
function RunFailureNotice({
  run,
  captured,
  failed,
}: {
  run: { error: string | null };
  captured: number;
  failed: number;
}) {
  return (
    <div className="rounded border border-danger-soft bg-danger-soft px-4 py-3 text-sm">
      {failed > 0 ? (
        <>
          <p className="font-semibold text-danger">
            {failed} of {captured + failed} captures failed
          </p>
          <p className="mt-0.5 text-text-muted">
            The pairs marked <span className="font-medium text-text">capture failed</span> below were skipped
            - open one for the reason. Everything else was captured and compared as usual.
          </p>
        </>
      ) : (
        <>
          <p className="font-semibold text-danger">Run failed</p>
          {run.error && <p className="mt-0.5 break-words font-mono text-xs text-text-muted">{run.error}</p>}
        </>
      )}
    </div>
  );
}
