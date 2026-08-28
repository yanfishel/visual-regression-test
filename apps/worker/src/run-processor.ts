import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { compare } from "odiff-bin";
import sharp from "sharp";
import {
  baselines,
  captureFailures,
  comparisons,
  db,
  pages,
  projects,
  runs,
  shots,
  viewports,
} from "@vrt/db";
import type { Project } from "@vrt/db";
import { createStorageFromEnv } from "@vrt/storage";
import { parseRegions, type RunProgress } from "@vrt/shared";
import { captureProjectShots, type CapturedShot } from "./capture.js";
import type { CapturedFavicon } from "./favicon.js";
import { notifyRunFinished } from "./notify.js";
import { regionReportFor } from "./region-compare.js";

const storage = createStorageFromEnv();

// WebP's hard per-dimension limit - see the fallback in processShot below.
const WEBP_MAX_DIMENSION = 16383;

export async function processRun(runId: string, onProgress?: (progress: RunProgress) => void): Promise<void> {
  const run = await db.query.runs.findFirst({ where: eq(runs.id, runId) });
  if (!run) {
    throw new Error(`Run not found: ${runId}`);
  }

  const project = await db.query.projects.findFirst({ where: eq(projects.id, run.projectId) });
  if (!project) {
    throw new Error(`Project not found: ${run.projectId}`);
  }

  // A run that is already `running` means a previous attempt started and
  // never finished - this is BullMQ's stalled-job retry after the worker
  // died mid-run. Re-processing would insert a second shots row for every
  // page already captured, so end the run here instead of capturing again.
  //
  // Ending it is the point: the throw below only fails the *job*, and once
  // that job is gone nothing else would ever touch the row -
  // reconcileStuckRuns only sweeps at worker startup, so the run would sit
  // `running` for ever beside a healthy, idle worker.
  if (run.status === "running") {
    const error = "Previous attempt died mid-run - not re-captured, to avoid duplicate shots";
    await db.update(runs).set({ status: "failed", finishedAt: new Date(), error }).where(eq(runs.id, runId));
    await notifyRunFinished(runId);
    throw new Error(`${error} (stalled job retry)`);
  }

  await db.update(runs).set({ status: "running", startedAt: new Date() }).where(eq(runs.id, runId));

  try {
    const pageConfigs = await db.query.pages.findMany({ where: eq(pages.projectId, project.id) });
    const viewportConfigs = await db.query.viewports.findMany({ where: eq(viewports.projectId, project.id) });

    const {
      shots: captured,
      failures,
      favicon,
    } = await captureProjectShots(project.baseUrl, pageConfigs, viewportConfigs, undefined, onProgress, {
      wantFavicon: project.faviconKey === null,
    });

    if (favicon) {
      await storeFavicon(project, favicon);
    }

    let compared = 0;
    for (const shot of captured) {
      const page = pageConfigs.find((candidate) => candidate.id === shot.pageId);
      const viewport = viewportConfigs.find((candidate) => candidate.id === shot.viewportId);
      // Defensive, not expected to trigger: every captured.pageId/viewportId
      // is drawn from these same pageConfigs/viewportConfigs arrays inside
      // captureProjectShots, so a miss here would mean the two went out of
      // sync. Progress reporting is best-effort (see queue.ts) - a bad label
      // shouldn't abort a run that would otherwise finish fine.
      onProgress?.({
        phase: "comparing",
        completed: compared,
        total: captured.length,
        label: `${page?.label ?? "?"} @ ${viewport?.label ?? "?"}`,
      });
      compared++;
      await processShot(project, runId, shot);
    }

    if (failures.length > 0) {
      // A run with skipped captures must not look like a clean, smaller run -
      // that would quietly hide exactly the regressions this tool exists to
      // catch. Comparisons for the pages that did capture are still recorded
      // above, so the partial report stays useful; each missing pair gets a
      // capture_failures row so the run grid can show it with its reason.
      await db.insert(captureFailures).values(failures.map((failure) => ({ runId, ...failure })));
      await db
        .update(runs)
        .set({
          status: "failed",
          finishedAt: new Date(),
          error: describeCaptureFailures(failures.length, pageConfigs.length * viewportConfigs.length),
        })
        .where(eq(runs.id, runId));
      await notifyRunFinished(runId);
      return;
    }

    await db.update(runs).set({ status: "done", finishedAt: new Date() }).where(eq(runs.id, runId));
    await notifyRunFinished(runId);
  } catch (error) {
    await db
      .update(runs)
      .set({
        status: "failed",
        finishedAt: new Date(),
        error: error instanceof Error ? error.message : String(error),
      })
      .where(eq(runs.id, runId));
    await notifyRunFinished(runId);
    throw error;
  }
}

export function describeCaptureFailures(failed: number, total: number): string {
  return `${failed} of ${total} captures failed`;
}

// Content-addressed like shots (`<sha256>.<format>`, see faviconKeySchema),
// so two projects tracking the same site share one file. The pointer is
// only written while the project still has the base URL the run captured
// from: an edit mid-run resets favicon_key for the *new* site (see the web
// save action), and the old site's icon must not land on top of that.
async function storeFavicon(project: Project, favicon: CapturedFavicon): Promise<void> {
  const hash = createHash("sha256").update(favicon.buffer).digest("hex");
  const storageKey = `${hash}.${favicon.format}`;
  await storage.put(storageKey, favicon.buffer);
  await db
    .update(projects)
    .set({ faviconKey: storageKey })
    .where(and(eq(projects.id, project.id), eq(projects.baseUrl, project.baseUrl)));
}

async function processShot(project: Project, runId: string, captured: CapturedShot): Promise<void> {
  // Lossless WebP: Playwright only emits PNG, WebP is 30-50% smaller with no
  // quality loss - see CLAUDE.md section 7. But WebP caps both dimensions at
  // 16383px, and a fullPage screenshot of a long page (especially at
  // deviceScaleFactor 2) can exceed that - found on a real portfolio
  // site - so those shots fall back to lossless PNG instead.
  const sourceMetadata = await sharp(captured.buffer).metadata();
  const tooLargeForWebp =
    (sourceMetadata.width ?? 0) > WEBP_MAX_DIMENSION || (sourceMetadata.height ?? 0) > WEBP_MAX_DIMENSION;

  const encodedBuffer = tooLargeForWebp
    ? await sharp(captured.buffer).png().toBuffer()
    : await sharp(captured.buffer).webp({ lossless: true }).toBuffer();
  const extension = tooLargeForWebp ? "png" : "webp";
  const metadata = await sharp(encodedBuffer).metadata();

  // Content-addressed key: identical pages across runs produce identical
  // bytes and therefore the same key, so storage.put is a no-op write.
  const hash = createHash("sha256").update(encodedBuffer).digest("hex");
  const storageKey = `${hash}.${extension}`;
  await storage.put(storageKey, encodedBuffer);

  const [shot] = await db
    .insert(shots)
    .values({
      runId,
      pageId: captured.pageId,
      viewportId: captured.viewportId,
      storageKey,
      width: metadata.width ?? 0,
      height: metadata.height ?? 0,
      regions: captured.regions,
    })
    .returning();
  if (!shot) {
    throw new Error("Failed to insert shot row");
  }

  const baseline = await db.query.baselines.findFirst({
    where: and(eq(baselines.pageId, captured.pageId), eq(baselines.viewportId, captured.viewportId)),
  });

  if (!baseline) {
    // First-ever shot for this page/viewport: nothing to compare against,
    // so it becomes the baseline. Later shots only move this pointer via
    // an explicit approval - see CLAUDE.md section 4.
    await db.insert(baselines).values({
      projectId: project.id,
      pageId: captured.pageId,
      viewportId: captured.viewportId,
      shotId: shot.id,
    });
    await db
      .insert(comparisons)
      .values({ shotId: shot.id, baselineShotId: null, status: "new", diffScore: null });
    return;
  }

  const baselineShot = await db.query.shots.findFirst({ where: eq(shots.id, baseline.shotId) });
  if (!baselineShot) {
    throw new Error(`Baseline shot missing: ${baseline.shotId}`);
  }

  // Read once, used by both comparisons below.
  const baselineBytes = await storage.get(baselineShot.storageKey);
  const { status, diffScore, heightDelta, widthDelta } = await diffAgainstBaseline(
    baselineBytes,
    captured.buffer,
    project.diffThreshold,
  );
  // Derived data beside the verdict (CLAUDE.md §6): null whenever a side
  // has no regions or the pipeline fails - regionReportFor never throws.
  const regionReport = await regionReportFor({
    shotId: shot.id,
    baselineRegions: parseRegions(baselineShot.regions),
    currentRegions: captured.regions,
    baselineImage: baselineBytes,
    currentImage: captured.buffer,
    maxDiffPercentage: project.diffThreshold * 100,
    // storageKey is a hash of encodedBuffer (§7), not of `captured.buffer`
    // itself - equal keys mean baselineBytes and encodedBuffer are the
    // same encoded bytes. That still implies equal *pixels* for the two
    // buffers actually passed above (baselineBytes decoded vs.
    // captured.buffer decoded) only because the §7 re-encode above is
    // lossless (`webp({ lossless: true })` / `png()`): decoding
    // captured.buffer directly and decoding its lossless re-encode
    // (encodedBuffer, byte-identical to baselineBytes here) yield the same
    // pixels. See the invariant note on `compareRegions` - a lossy encode
    // path would break this silently.
    identicalImages: baselineShot.storageKey === storageKey,
  });
  await db.insert(comparisons).values({
    shotId: shot.id,
    baselineShotId: baselineShot.id,
    status,
    diffScore,
    heightDelta,
    widthDelta,
    regionReport,
  });
}

export async function diffAgainstBaseline(
  baselineBytes: Buffer,
  currentPngBuffer: Buffer,
  diffThreshold: number,
  runCompare: typeof compare = compare,
): Promise<{
  status: "passed" | "failed";
  diffScore: number | null;
  heightDelta: number | null;
  widthDelta: number | null;
}> {
  // sharp detects the input format from the bytes, so this decodes
  // correctly whether the baseline was stored as webp or png.
  const baselinePng = await sharp(baselineBytes).png().toBuffer();

  const dir = await mkdtemp(path.join(tmpdir(), "vrt-diff-"));
  const baselinePath = path.join(dir, "baseline.png");
  const currentPath = path.join(dir, "current.png");
  // odiff requires a diff-image output path, but per CLAUDE.md section 7 we
  // never persist diff images - a real one is generated on demand by the
  // web app when a comparison is viewed. Discard this one immediately.
  const diffPath = path.join(dir, "diff.png");

  try {
    await writeFile(baselinePath, baselinePng);
    await writeFile(currentPath, currentPngBuffer);

    // `antialiasing: true` is odiff's per-pixel color-difference tolerance,
    // not the aggregate mismatch budget - that's diffThreshold, applied
    // below against the aggregate diffPercentage. See CLAUDE.md section 6.
    // `failOnLayoutDiff: true` makes any dimension mismatch deterministically
    // report reason: "layout-diff" - without it, odiff's implicit behavior
    // is asymmetric (e.g. a page that shrank gets compared against the
    // baseline's now-missing rows as pure diff, exactly the "everything
    // changed" false positive CLAUDE.md section 6 warns about).
    const result = await runCompare(baselinePath, currentPath, diffPath, {
      antialiasing: true,
      failOnLayoutDiff: true,
    });
    const maxDiffPercentage = diffThreshold * 100;

    if (result.match) {
      return { status: "passed", diffScore: 0, heightDelta: null, widthDelta: null };
    }
    if (result.reason === "pixel-diff") {
      return {
        status: result.diffPercentage <= maxDiffPercentage ? "passed" : "failed",
        diffScore: result.diffPercentage,
        heightDelta: null,
        widthDelta: null,
      };
    }
    if (result.reason === "layout-diff") {
      // Awaited explicitly (not `return diffTopAlignedRegion(...)`) so the
      // finally block below doesn't rm() this function's temp dir out from
      // under diffTopAlignedRegion's still-pending writes into it.
      return await diffTopAlignedRegion(baselinePng, currentPngBuffer, dir, maxDiffPercentage, runCompare);
    }
    // reason === "file-not-exists": the baseline file odiff was asked to
    // read is gone (e.g. storage volume reset while the `baselines` row
    // still points at it). That's a data-integrity problem, not an ordinary
    // visual diff - don't mask it as one.
    throw new Error(`Baseline file missing from storage: ${result.file}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// Minimum viable handling for a page size change per CLAUDE.md section 6:
// align both images to their shared top-left region and diff only that,
// reporting the height and width deltas separately instead of letting the
// size mismatch itself register as a false-positive diff. (odiff's
// layout-diff fires on either dimension differing, so width changes -
// scrollbar/dsf edge cases - land here too and must not be dropped.)
async function diffTopAlignedRegion(
  baselinePng: Buffer,
  currentPngBuffer: Buffer,
  dir: string,
  maxDiffPercentage: number,
  runCompare: typeof compare,
): Promise<{
  status: "passed" | "failed";
  diffScore: number | null;
  heightDelta: number;
  widthDelta: number;
}> {
  const [baselineMeta, currentMeta] = await Promise.all([
    sharp(baselinePng).metadata(),
    sharp(currentPngBuffer).metadata(),
  ]);
  const baselineHeight = baselineMeta.height ?? 0;
  const currentHeight = currentMeta.height ?? 0;
  const baselineWidth = baselineMeta.width ?? 0;
  const currentWidth = currentMeta.width ?? 0;
  const sharedWidth = Math.min(baselineWidth, currentWidth);
  const sharedHeight = Math.min(baselineHeight, currentHeight);

  const croppedBaselinePath = path.join(dir, "baseline-top.png");
  const croppedCurrentPath = path.join(dir, "current-top.png");
  const croppedDiffPath = path.join(dir, "diff-top.png");

  await sharp(baselinePng)
    .extract({ left: 0, top: 0, width: sharedWidth, height: sharedHeight })
    .png()
    .toFile(croppedBaselinePath);
  await sharp(currentPngBuffer)
    .extract({ left: 0, top: 0, width: sharedWidth, height: sharedHeight })
    .png()
    .toFile(croppedCurrentPath);

  const result = await runCompare(croppedBaselinePath, croppedCurrentPath, croppedDiffPath, {
    antialiasing: true,
  });
  const heightDelta = currentHeight - baselineHeight;
  const widthDelta = currentWidth - baselineWidth;

  if (result.match) {
    return { status: "passed", diffScore: 0, heightDelta, widthDelta };
  }
  if (result.reason === "pixel-diff") {
    return {
      status: result.diffPercentage <= maxDiffPercentage ? "passed" : "failed",
      diffScore: result.diffPercentage,
      heightDelta,
      widthDelta,
    };
  }
  throw new Error(`Unexpected odiff result comparing top-aligned region: ${result.reason}`);
}
