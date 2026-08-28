import { describe, expect, it, vi } from "vitest";
import type { Database } from "@vrt/db";
import type { Storage } from "@vrt/storage";
import { releaseFaviconFile } from "./favicon-release.js";

function fakeDb(referencingRows: unknown[]): Database {
  return {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => referencingRows }) }),
    }),
  } as unknown as Database;
}

function fakeStorage(deleteImpl: () => Promise<void> = async () => undefined) {
  const remove = vi.fn(deleteImpl);
  const storage = { delete: remove } as unknown as Storage;
  return { storage, remove };
}

const KEY = "ab".repeat(32) + ".ico";

describe("releaseFaviconFile", () => {
  it("deletes the file once no project references the key", async () => {
    const { storage, remove } = fakeStorage();
    await releaseFaviconFile(fakeDb([]), KEY, storage);
    expect(remove).toHaveBeenCalledWith(KEY);
  });

  it("keeps a file another project still points at", async () => {
    const { storage, remove } = fakeStorage();
    await releaseFaviconFile(fakeDb([{ id: "other" }]), KEY, storage);
    expect(remove).not.toHaveBeenCalled();
  });

  it("swallows storage errors - an orphaned file is the accepted failure mode", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { storage } = fakeStorage(async () => {
      throw new Error("EACCES");
    });
    await expect(releaseFaviconFile(fakeDb([]), KEY, storage)).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
