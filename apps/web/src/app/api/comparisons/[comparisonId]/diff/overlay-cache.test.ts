import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pruneOverlayCache } from "./overlay-cache.js";

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "vrt-overlay-cache-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("pruneOverlayCache", () => {
  it("removes entries older than the max age and keeps fresh ones", async () => {
    const oldPath = path.join(dir, "old.png");
    const freshPath = path.join(dir, "fresh.png");
    await writeFile(oldPath, "old");
    await writeFile(freshPath, "fresh");
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    await utimes(oldPath, tenDaysAgo, tenDaysAgo);

    await pruneOverlayCache(dir, 7 * 24 * 60 * 60 * 1000);

    expect(await readdir(dir)).toEqual(["fresh.png"]);
  });

  it("is a no-op when the cache directory doesn't exist yet", async () => {
    await expect(pruneOverlayCache(path.join(dir, "nope"), 1000)).resolves.toBeUndefined();
  });
});
