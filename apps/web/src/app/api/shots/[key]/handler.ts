import type { NextResponse } from "next/server";
import type { Storage } from "@vrt/storage";
// Relative, not `@/`: this file is under test, and vitest doesn't resolve
// the Next path alias.
import { streamStoredImage } from "../../../../lib/stored-image-response.js";

export async function handleShotRequest(key: string, storage: Storage): Promise<NextResponse> {
  return streamStoredImage(key, storage, key.endsWith(".png") ? "image/png" : "image/webp");
}
