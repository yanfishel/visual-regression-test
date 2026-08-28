import { afterEach, describe, expect, it, vi } from "vitest";

const CACHE_KEY = Symbol.for("vrt.db.instance");

// `next dev` re-evaluates the module graph on every HMR compile. If the pool
// lives only in module scope, each compile opens a fresh postgres-js pool
// (10 connections) and never closes the old one - observed saturating
// Postgres' 100-connection cap in one dev session.
describe("db client module cache", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    delete (globalThis as Record<symbol, unknown>)[CACHE_KEY];
  });

  it("reuses the same drizzle instance across module re-evaluations outside production", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://vrt:vrt@localhost:5432/vrt");

    const first = (await import("./client.js")).db.query;
    vi.resetModules();
    const second = (await import("./client.js")).db.query;

    expect(second).toBe(first);
  });
});
