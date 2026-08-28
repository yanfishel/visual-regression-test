import { tmpdir } from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { comparisonIdSchema } from "@vrt/shared";
import { db } from "@vrt/db";
import { createStorageFromEnv, type Storage } from "@vrt/storage";
import { getOptionalUser } from "@/lib/auth/user";
import { canAccessComparison } from "@/lib/authz";
import { handleDiffRequest } from "./handler.js";

// Created on first request, same reasoning as /api/shots/[key]'s route.ts:
// this module loads during `next build`'s page-data collection, before
// STORAGE_LOCAL_PATH is available.
let storage: Storage | undefined;
// Age-bounded, not size-bounded: overlay-cache.ts prunes files older than
// seven days, best-effort and at most hourly, after a fresh overlay write
// (CLAUDE.md section 7). There is still no size cap - one file per distinct
// (current, baseline) shot pair viewed within the week.
// computeDiffOverlay() also decodes both source images to raw RGBA in
// memory simultaneously per request, with no concurrency limit - for a
// very tall full-page capture (CLAUDE.md documents a real 20440px-tall
// example) that's tens of MB transient per request. Acceptable for a
// single-user self-hosted tool; would need bounding (a size-limited tmpfs
// mount, an LRU prune on write, a request concurrency limiter) before
// multi-user or high-volume use.
const cacheDir = path.join(tmpdir(), "vrt-diff-overlays");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ comparisonId: string }> },
): Promise<NextResponse> {
  const { comparisonId: rawId } = await params;
  const parsed = comparisonIdSchema.safeParse(rawId);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid comparison id" }, { status: 400 });
  }

  const user = await getOptionalUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await canAccessComparison(db, user, parsed.data))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  storage ??= createStorageFromEnv();
  return handleDiffRequest(parsed.data, db, storage, cacheDir);
}
