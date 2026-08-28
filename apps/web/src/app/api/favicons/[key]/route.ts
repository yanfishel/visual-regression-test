import { NextResponse } from "next/server";
import { FAVICON_FORMATS, faviconKeySchema, type FaviconFormat } from "@vrt/shared";
import { createStorageFromEnv, type Storage } from "@vrt/storage";
import { db } from "@vrt/db";
import { getOptionalUser } from "@/lib/auth/user";
import { canAccessFaviconKey } from "@/lib/authz";
import { streamStoredImage } from "@/lib/stored-image-response";

// A project's stored site favicon (projects.favicon_key, written by the
// worker - see apps/worker/src/favicon.ts), served the same way shots are:
// content-hash key in the URL, immutable cache, storage layer only.

// Created on first request, not at module load - same reason as the shots
// route: STORAGE_LOCAL_PATH only exists in the runtime container.
let storage: Storage | undefined;

// The bytes came from a third-party site. Served as an <img> they're inert,
// but an SVG opened directly in a tab would run its scripts on our origin -
// the sandbox forbids that, and nosniff (set by streamStoredImage) keeps a
// browser from second-guessing the type.
const FAVICON_HEADERS = {
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
): Promise<NextResponse> {
  const { key: rawKey } = await params;
  const parsed = faviconKeySchema.safeParse(rawKey);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }

  const user = await getOptionalUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await canAccessFaviconKey(db, user, parsed.data))) {
    // 404, not 403: don't confirm that bytes for this hash exist.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const format = parsed.data.slice(parsed.data.lastIndexOf(".") + 1) as FaviconFormat;
  storage ??= createStorageFromEnv();
  return streamStoredImage(parsed.data, storage, FAVICON_FORMATS[format], FAVICON_HEADERS);
}
