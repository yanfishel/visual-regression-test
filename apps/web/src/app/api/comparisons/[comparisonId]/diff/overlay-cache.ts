import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

// The overlay cache was originally unbounded (a documented tradeoff); this
// keeps it bounded by age instead. Overlay files are pure derivatives of two
// content-addressed shots, so deleting one only costs a recompute on the
// next view.
export const OVERLAY_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export async function pruneOverlayCache(cacheDir: string, maxAgeMs: number): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(cacheDir);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }

  const cutoff = Date.now() - maxAgeMs;
  for (const entry of entries) {
    const entryPath = path.join(cacheDir, entry);
    try {
      const { mtimeMs } = await stat(entryPath);
      if (mtimeMs < cutoff) {
        await rm(entryPath, { force: true });
      }
    } catch {
      // Best-effort: a file deleted concurrently (or a permissions hiccup)
      // just stays for the next sweep.
    }
  }
}
