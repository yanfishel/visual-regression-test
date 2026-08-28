import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import type { Comparison, Database, Shot } from "@vrt/db";
import type { Storage } from "@vrt/storage";
import { handleDiffRequest } from "./handler.js";

let cacheDir: string;

beforeAll(async () => {
  cacheDir = await mkdtemp(path.join(tmpdir(), "vrt-diff-route-"));
});

afterAll(async () => {
  await rm(cacheDir, { recursive: true, force: true });
});

function fakeDatabase(fixtures: { comparison?: Comparison; shots: Shot[] }): Database {
  return {
    query: {
      comparisons: { findFirst: async () => fixtures.comparison },
      shots: { findMany: async () => fixtures.shots },
    },
  } as unknown as Database;
}

async function makeSolidPng(color: { r: number; g: number; b: number }): Promise<Buffer> {
  return sharp({ create: { width: 4, height: 4, channels: 3, background: color } })
    .png()
    .toBuffer();
}

function memoryStorage(files: Record<string, Buffer>): Storage {
  const get = vi.fn(async (key: string) => {
    const buffer = files[key];
    if (!buffer) {
      throw Object.assign(new Error("not found"), { code: "ENOENT" });
    }
    return buffer;
  });
  return {
    get,
    getStream: vi.fn(async (key: string) => {
      const buffer = await get(key);
      return {
        size: buffer.length,
        stream: new Blob([new Uint8Array(buffer)]).stream() as ReadableStream<Uint8Array>,
      };
    }),
    put: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    urlFor: (key: string) => key,
  };
}

describe("handleDiffRequest", () => {
  it("returns 404 when the comparison doesn't exist", async () => {
    const database = fakeDatabase({ comparison: undefined, shots: [] });
    const storage = memoryStorage({});

    const response = await handleDiffRequest("missing", database, storage, cacheDir);

    expect(response.status).toBe(404);
  });

  it("returns 404 when the comparison has no baseline yet", async () => {
    const comparison = { id: "cmp-1", shotId: "shot-1", baselineShotId: null } as Comparison;
    const database = fakeDatabase({ comparison, shots: [] });
    const storage = memoryStorage({});

    const response = await handleDiffRequest("cmp-1", database, storage, cacheDir);

    expect(response.status).toBe(404);
  });

  it("computes and caches the overlay on the first request, then serves the cache on the second", async () => {
    const currentPng = await makeSolidPng({ r: 200, g: 0, b: 0 });
    const baselinePng = await makeSolidPng({ r: 10, g: 10, b: 10 });
    const comparison = { id: "cmp-1", shotId: "shot-1", baselineShotId: "shot-2" } as Comparison;
    const shots: Shot[] = [
      { id: "shot-1", storageKey: "current-key.png" } as Shot,
      { id: "shot-2", storageKey: "baseline-key.png" } as Shot,
    ];
    const database = fakeDatabase({ comparison, shots });
    const storage = memoryStorage({ "current-key.png": currentPng, "baseline-key.png": baselinePng });

    const first = await handleDiffRequest("cmp-1", database, storage, cacheDir);
    expect(first.status).toBe(200);
    expect(storage.get).toHaveBeenCalledTimes(2);

    const second = await handleDiffRequest("cmp-1", database, storage, cacheDir);
    expect(second.status).toBe(200);
    // Cache hit on the second call - storage.get isn't called again.
    expect(storage.get).toHaveBeenCalledTimes(2);
  });

  it("returns 404 without logging when the current shot's file is missing", async () => {
    const baselinePng = await makeSolidPng({ r: 10, g: 10, b: 10 });
    const comparison = {
      id: "cmp-missing-current",
      shotId: "shot-1",
      baselineShotId: "shot-2",
    } as Comparison;
    const shots: Shot[] = [
      { id: "shot-1", storageKey: "missing-current-key.png" } as Shot,
      { id: "shot-2", storageKey: "baseline-only-key.png" } as Shot,
    ];
    const database = fakeDatabase({ comparison, shots });
    const storage = memoryStorage({ "baseline-only-key.png": baselinePng });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await handleDiffRequest("cmp-missing-current", database, storage, cacheDir);

    expect(response.status).toBe(404);
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("returns 404 without logging when the baseline shot's file is missing", async () => {
    const currentPng = await makeSolidPng({ r: 200, g: 0, b: 0 });
    const comparison = {
      id: "cmp-missing-baseline",
      shotId: "shot-1",
      baselineShotId: "shot-2",
    } as Comparison;
    const shots: Shot[] = [
      { id: "shot-1", storageKey: "current-only-key.png" } as Shot,
      { id: "shot-2", storageKey: "missing-baseline-key.png" } as Shot,
    ];
    const database = fakeDatabase({ comparison, shots });
    const storage = memoryStorage({ "current-only-key.png": currentPng });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await handleDiffRequest("cmp-missing-baseline", database, storage, cacheDir);

    expect(response.status).toBe(404);
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("returns a logged 500 instead of throwing when a shot can't be decoded as an image", async () => {
    const comparison = { id: "cmp-corrupt", shotId: "shot-1", baselineShotId: "shot-2" } as Comparison;
    const shots: Shot[] = [
      { id: "shot-1", storageKey: "corrupt-key.png" } as Shot,
      { id: "shot-2", storageKey: "baseline-ok-key.png" } as Shot,
    ];
    const database = fakeDatabase({ comparison, shots });
    const storage = memoryStorage({
      "corrupt-key.png": Buffer.from("not an image at all"),
      "baseline-ok-key.png": await makeSolidPng({ r: 10, g: 10, b: 10 }),
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await handleDiffRequest("cmp-corrupt", database, storage, cacheDir);

    expect(response.status).toBe(500);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("returns 500 and logs when storage.get() fails for a reason other than the file being missing", async () => {
    const baselinePng = await makeSolidPng({ r: 10, g: 10, b: 10 });
    const comparison = { id: "cmp-broken", shotId: "shot-1", baselineShotId: "shot-2" } as Comparison;
    const shots: Shot[] = [
      { id: "shot-1", storageKey: "broken-key.png" } as Shot,
      { id: "shot-2", storageKey: "baseline-broken-key.png" } as Shot,
    ];
    const database = fakeDatabase({ comparison, shots });
    const storage: Storage = {
      get: vi.fn(async (key: string) => {
        if (key === "broken-key.png") {
          throw new Error("EACCES: permission denied");
        }
        return baselinePng;
      }),
      getStream: vi.fn(async () => {
        throw new Error("EACCES: permission denied");
      }),
      put: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
      urlFor: (key: string) => key,
    };
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await handleDiffRequest("cmp-broken", database, storage, cacheDir);

    expect(response.status).toBe(500);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
