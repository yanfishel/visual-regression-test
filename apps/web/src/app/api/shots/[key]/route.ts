import { NextResponse } from "next/server";
import { shotKeySchema } from "@vrt/shared";
import { createStorageFromEnv, type Storage } from "@vrt/storage";
import { getOptionalUser } from "@/lib/auth/user";
import { canAccessStorageKey } from "@/lib/authz";
import { db } from "@vrt/db";
import { handleShotRequest } from "./handler.js";

// Created on first request, not at module load - this module is imported
// during `next build`'s page-data collection, before STORAGE_LOCAL_PATH is
// available (it's only injected into the runtime container).
let storage: Storage | undefined;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
): Promise<NextResponse> {
  const { key: rawKey } = await params;
  const parsed = shotKeySchema.safeParse(rawKey);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }

  const user = await getOptionalUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await canAccessStorageKey(db, user, parsed.data))) {
    // 404, not 403: don't confirm that bytes for this hash exist.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  storage ??= createStorageFromEnv();
  return handleShotRequest(parsed.data, storage);
}
