import { NextResponse } from "next/server";
import type { Storage } from "@vrt/storage";
import { isNotFoundError } from "@vrt/shared";

// One streaming response for every image the storage layer serves (shots,
// favicons): the caller has already validated the key's shape and the
// user's access, and knows the content type from the key's extension.
export async function streamStoredImage(
  key: string,
  storage: Storage,
  contentType: string,
  extraHeaders: Record<string, string> = {},
): Promise<NextResponse> {
  try {
    // Streamed, not buffered: a fullPage PNG can be tens of MB, and get()
    // would hold one whole copy in memory per concurrent request.
    const { stream, size } = await storage.getStream(key);
    return new NextResponse(stream, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(size),
        "X-Content-Type-Options": "nosniff",
        // Keys are content hashes, so a URL's bytes never change once
        // served - see CLAUDE.md section 7.
        "Cache-Control": "public, max-age=31536000, immutable",
        ...extraHeaders,
      },
    });
  } catch (error) {
    if (isNotFoundError(error)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // Anything other than "file genuinely doesn't exist" - permissions,
    // an unmounted volume, disk corruption - is a storage-layer problem,
    // not a missing image. Surface it distinctly instead of a plain 404 so
    // it isn't mistaken for the ordinary case.
    console.error(`Failed to read ${key} from storage:`, error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
