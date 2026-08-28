import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalStorage, type Storage } from "@vrt/storage";
import { handleShotRequest } from "./handler.js";

let tempDir: string;

beforeAll(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), "vrt-shots-route-"));
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("handleShotRequest", () => {
  it("streams the shot with a content-length header instead of buffering it whole", async () => {
    const storage = new LocalStorage({ rootDir: tempDir });
    await storage.put("streamed-key.webp", Buffer.from("shot-bytes"));

    const response = await handleShotRequest("streamed-key.webp", storage);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-length")).toBe("10");
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("shot-bytes");
  });

  it("returns 404 without logging when the shot genuinely doesn't exist", async () => {
    const storage = new LocalStorage({ rootDir: tempDir });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await handleShotRequest("never-stored-key.png", storage);

    expect(response.status).toBe(404);
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("returns 500 and logs when the storage read fails for a reason other than the file being missing", async () => {
    const brokenStorage: Storage = {
      get: async () => {
        throw new Error("EACCES: permission denied");
      },
      getStream: async () => {
        throw new Error("EACCES: permission denied");
      },
      put: async () => undefined,
      delete: async () => undefined,
      urlFor: (key) => key,
    };
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await handleShotRequest("some-key.webp", brokenStorage);

    expect(response.status).toBe(500);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
