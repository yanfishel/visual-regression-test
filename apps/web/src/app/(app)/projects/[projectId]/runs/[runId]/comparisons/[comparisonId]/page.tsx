import { notFound } from "next/navigation";
import { db } from "@vrt/db";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ComparisonNav } from "@/components/comparison-nav";
import { ComparisonViewer } from "@/components/comparison-viewer";
import { CheckIcon } from "@/components/icons";
import { LocalTime } from "@/components/local-time";
import { isPendingApproval } from "@/lib/approve-comparisons";
import { getCurrentUser } from "@/lib/auth/user";
import { findProjectForUser } from "@/lib/authz";
import { COMPARISON_STATUS_CLASS } from "@/lib/comparison-status";
import { formatDiffScore } from "@/lib/diff-score";
import { formatRegionSummary } from "@/lib/region-report";
import { getComparisonViewData } from "./data.js";
import { approveComparisonAction } from "./actions.js";

export const dynamic = "force-dynamic";

export default async function ComparisonPage({
  params,
}: {
  params: Promise<{ projectId: string; runId: string; comparisonId: string }>;
}) {
  const { projectId, runId, comparisonId } = await params;

  const user = await getCurrentUser();
  const project = await findProjectForUser(db, projectId, user);
  if (!project) {
    notFound();
  }

  const data = await getComparisonViewData(comparisonId, runId, projectId);
  if (!data) {
    notFound();
  }
  const {
    run,
    comparison,
    page,
    viewport,
    currentShot,
    baselineShot,
    baselineRun,
    siblings,
    index,
    regionReport,
  } = data;
  const pending = isPendingApproval(comparison.status);
  const regionSummary = formatRegionSummary(regionReport);

  return (
    <main className="space-y-4">
      {/* Title row: crumbs + title left, the verdict right (a size up from
          the list pills - it is this page's headline fact). */}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <Breadcrumbs
            items={[
              { label: "Projects", href: "/projects" },
              { label: project.name, href: `/projects/${projectId}` },
              { label: <LocalTime date={run.createdAt} />, href: `/projects/${projectId}/runs/${runId}` },
              { label: `${page.label} @ ${viewport.label}` },
            ]}
          />
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">
            {page.label} @ {viewport.label}
          </h1>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          {regionSummary && <span className="text-sm text-text-muted">{regionSummary}</span>}
          {comparison.heightDelta != null && (
            <span className="text-sm text-text-muted">height delta: {comparison.heightDelta}px</span>
          )}
          {comparison.widthDelta != null && comparison.widthDelta !== 0 && (
            <span className="text-sm text-text-muted">width delta: {comparison.widthDelta}px</span>
          )}
          <span
            className={`pill px-3 py-1.5 text-sm ${COMPARISON_STATUS_CLASS[comparison.status] ?? "pill-new"}`}
          >
            {comparison.status}
            {comparison.diffScore != null ? ` (${formatDiffScore(comparison.diffScore, 3)})` : ""}
          </span>
        </div>
      </div>

      {/* Action row: the run walk left, the verdict button right. Both wrap
          under each other on narrow screens rather than overflow. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <ComparisonNav projectId={projectId} runId={runId} siblings={siblings} index={index} />
        {/* The button's weight follows what there is to decide: the one
            primary action for a diff waiting on a verdict (failed/new);
            quiet for a passed pair, where the baseline already stands and
            re-pointing it is optional; done once approved. Approving moves
            on to the run's next pending comparison (actions.ts). */}
        <form action={approveComparisonAction}>
          <input type="hidden" name="comparisonId" value={comparison.id} />
          {comparison.status === "approved" ? (
            <button type="submit" disabled className="btn btn-outline">
              <CheckIcon className="h-4 w-4" />
              Approved
            </button>
          ) : (
            <button type="submit" className={`btn ${pending ? "btn-primary" : "btn-quiet"}`}>
              Approve as baseline
            </button>
          )}
        </form>
      </div>

      {baselineShot ? (
        <ComparisonViewer
          currentUrl={`/api/shots/${currentShot.storageKey}`}
          baselineUrl={`/api/shots/${baselineShot.storageKey}`}
          diffOverlayUrl={`/api/comparisons/${comparison.id}/diff`}
          altText={`${page.label} @ ${viewport.label}`}
          baselineCaption={
            <>
              <span className="font-semibold text-text">Baseline</span>
              {baselineRun && (
                <>
                  {" · "}
                  <LocalTime date={baselineRun.createdAt} />
                </>
              )}
            </>
          }
          currentCaption={
            <>
              <span className="font-semibold text-text">Current</span> · this run
            </>
          }
          regionReport={regionReport}
          currentSize={{ width: currentShot.width, height: currentShot.height }}
          baselineSize={{ width: baselineShot.width, height: baselineShot.height }}
        />
      ) : (
        // No baseline yet, nothing to compare: the same panel shape as the
        // viewer (caption strip, capture capped at 80vh) so a first-run page
        // doesn't stretch to the full height of a fullPage shot - only here
        // the capture scrolls instead of panning.
        <div className="panel overflow-hidden">
          {/* Same height and type as the viewer's tab strip, so the two
              panel shapes line up from one comparison to the next. */}
          <div className="border-b border-border px-4 py-2.5 text-sm text-text-muted">
            <span className="font-semibold text-text">First capture</span> · this run - it became the baseline
          </div>
          <div className="max-h-[80vh] overflow-y-auto bg-surface-alt">
            <img
              src={`/api/shots/${currentShot.storageKey}`}
              alt={`${page.label} @ ${viewport.label}`}
              className="mx-auto block max-w-full h-auto"
            />
          </div>
        </div>
      )}
    </main>
  );
}
