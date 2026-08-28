import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type { Storage, StorageStream } from "./types.js";

export interface LocalStorageOptions {
  /** Directory shots are written under, e.g. STORAGE_LOCAL_PATH. */
  rootDir: string;
  /** Prefix the serving route handler is mounted at, e.g. STORAGE_URL_PREFIX. */
  urlPrefix?: string;
}

// Keys are content-addressed (sha256 of the bytes), so the same shot written
// by two workers at once resolves to the same path - see CLAUDE.md section 7.
export class LocalStorage implements Storage {
  private readonly rootDir: string;
  private readonly urlPrefix: string;

  constructor(options: LocalStorageOptions) {
    this.rootDir = options.rootDir;
    this.urlPrefix = options.urlPrefix ?? "/api/shots";
  }

  private shardedPath(key: string): string {
    const shardA = key.slice(0, 2);
    const shardB = key.slice(2, 4);
    return path.join(this.rootDir, shardA, shardB, key);
  }

  async put(key: string, buf: Buffer): Promise<void> {
    const target = this.shardedPath(key);
    await mkdir(path.dirname(target), { recursive: true });

    // Write to a temp file in the same directory then rename, which is
    // atomic on the same filesystem. If another worker already wrote this
    // hash, the rename just overwrites identical bytes - a no-op in effect,
    // never an error.
    const tempPath = `${target}.${randomUUID()}.tmp`;
    await writeFile(tempPath, buf);
    try {
      await rename(tempPath, target);
    } catch (error) {
      await rm(tempPath, { force: true });
      throw error;
    }
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.shardedPath(key));
  }

  async getStream(key: string): Promise<StorageStream> {
    const target = this.shardedPath(key);
    // stat first: a missing file must reject here (same ENOENT the routes
    // already map to 404), not error the stream after headers are sent.
    const { size } = await stat(target);
    const stream = Readable.toWeb(createReadStream(target)) as ReadableStream<Uint8Array>;
    return { stream, size };
  }

  async delete(key: string): Promise<void> {
    await rm(this.shardedPath(key), { force: true });
  }

  urlFor(key: string): string {
    return `${this.urlPrefix}/${key}`;
  }
}
