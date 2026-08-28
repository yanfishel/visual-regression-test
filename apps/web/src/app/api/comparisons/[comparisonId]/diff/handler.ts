import { createReadStream } from "node:fs";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { comparisons, shots, type Database } from "@vrt/db";
import type { Storage } from "@vrt/storage";
import { isNotFoundError } from "@vrt/shared";
import { computeDiffOverlay } from "./overlay.js";
import { OVERLAY_CACHE_MAX_AGE_MS, pruneOverlayCache } from "./overlay-cache.js";

// Prune at most once an hour per process - the sweep is cheap but there's no
// point stat-ing the whole cache on every miss.
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;
let lastPruneAt = 0;

export async function handleDiffRequest(
  comparisonId: string,
  database: Database,
  storage: Storage,
  cacheDir: string,
): Promise<NextResponse> {
  const comparison = await database.query.comparisons.findFirst({ where: eq(comparisons.id, comparisonId) });
  if (!comparison || !comparison.baselineShotId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const shotRows = await database.query.shots.findMany({
    where: inArray(shots.id, [comparison.shotId, comparison.baselineShotId]),
  });
  const currentShot = shotRows.find((shot) => shot.id === comparison.shotId);
  const baselineShot = shotRows.find((shot) => shot.id === comparison.baselineShotId);
  if (!currentShot || !baselineShot) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Content-addressed cache key: both storage keys are sha256 hashes of
  // the shot bytes, so this pairing is deterministic and never needs
  // invalidating. Lives under os.tmpdir(), not the Storage layer - see
  // CLAUDE.md section 7's "never store diff images".
  const cacheKey = `${currentShot.storageKey}__${baselineShot.storageKey}.png`;
  const cachePath = path.join(cacheDir, cacheKey);

  const cached = await streamCacheFile(cachePath);
  if (cached) {
    return imageResponse(cached.stream, cached.size);
  }

  const [currentSettled, baselineSettled] = await Promise.allSettled([
    storage.get(currentShot.storageKey),
    storage.get(baselineShot.storageKey),
  ]);

  const currentBuffer = resolveShotBuffer(currentSettled, "current", comparisonId);
  if (currentBuffer instanceof NextResponse) {
    return currentBuffer;
  }
  const baselineBuffer = resolveShotBuffer(baselineSettled, "baseline", comparisonId);
  if (baselineBuffer instanceof NextResponse) {
    return baselineBuffer;
  }

  let overlay: Buffer;
  try {
    overlay = await computeDiffOverlay(currentBuffer, baselineBuffer);
  } catch (error) {
    // A shot that can't be decoded (corrupt file, zero-dimension metadata)
    // is a data problem, not a request problem - log it with the comparison
    // id instead of surfacing a bare framework 500.
    console.error(`Failed to compute diff overlay for comparison ${comparisonId}:`, error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  await mkdir(cacheDir, { recursive: true });
  const tempPath = `${cachePath}.${randomUUID()}.tmp`;
  await writeFile(tempPath, overlay);
  try {
    await rename(tempPath, cachePath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }

  // Bound the cache by age, best-effort, off the request's critical path.
  if (Date.now() - lastPruneAt > PRUNE_INTERVAL_MS) {
    lastPruneAt = Date.now();
    void pruneOverlayCache(cacheDir, OVERLAY_CACHE_MAX_AGE_MS).catch((error) => {
      console.error("Overlay cache prune failed:", error);
    });
  }

  return imageResponse(new Uint8Array(overlay), overlay.length);
}

// Mirrors the shots route's ENOENT-vs-everything-else handling (see
// apps/web/src/app/api/shots/[key]/handler.ts): a missing shot file is a
// clean 404, anything else (permissions, an unmounted volume) is a genuine
// storage-layer failure and gets logged with which side (current/baseline)
// and which comparison it was for.
function resolveShotBuffer(
  result: PromiseSettledResult<Buffer>,
  label: "current" | "baseline",
  comparisonId: string,
): Buffer | NextResponse {
  if (result.status === "fulfilled") {
    return result.value;
  }
  const error = result.reason;
  if (isNotFoundError(error)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  console.error(`Failed to read ${label} shot for comparison ${comparisonId} from storage:`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

// A cache hit streams from disk instead of buffering: overlays are as large
// as the shots they tint. stat-first so a vanished file is a clean miss, not
// a stream error after headers.
async function streamCacheFile(
  cachePath: string,
): Promise<{ stream: ReadableStream<Uint8Array>; size: number } | null> {
  try {
    const { size } = await stat(cachePath);
    const stream = Readable.toWeb(createReadStream(cachePath)) as ReadableStream<Uint8Array>;
    return { stream, size };
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function imageResponse(
  body: ReadableStream<Uint8Array> | Uint8Array<ArrayBuffer>,
  size: number,
): NextResponse {
  return new NextResponse(body, {
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(size),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
