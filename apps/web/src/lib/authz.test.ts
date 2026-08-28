import { describe, expect, it } from "vitest";
import type { Database, Project, UserRow } from "@vrt/db";
import {
  canAccessComparison,
  canAccessFaviconKey,
  canAccessStorageKey,
  findProjectForUser,
  isAdmin,
  resolveProjectOwner,
} from "./authz.js";

const user: UserRow = {
  id: "33333333-3333-4333-8333-333333333333",
  clerkId: null,
  email: "u@example.com",
  role: "user",
  createdAt: new Date(0),
};
const admin: UserRow = { ...user, id: "44444444-4444-4444-8444-444444444444", role: "admin" };

function createFakeDb(options: { project?: unknown; joinRows?: unknown[] }): Database {
  return {
    query: { projects: { findFirst: async () => options.project } },
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => options.joinRows ?? [] }),
        innerJoin: () => ({
          innerJoin: () => ({
            where: () => ({ limit: async () => options.joinRows ?? [] }),
            innerJoin: () => ({ where: () => ({ limit: async () => options.joinRows ?? [] }) }),
          }),
        }),
      }),
    }),
  } as unknown as Database;
}

describe("isAdmin", () => {
  it("is true only for the admin role", () => {
    expect(isAdmin(admin)).toBe(true);
    expect(isAdmin(user)).toBe(false);
  });
});

describe("findProjectForUser", () => {
  it("returns the found project", async () => {
    const project = { id: "p1", ownerId: user.id };
    expect(await findProjectForUser(createFakeDb({ project }), "p1", user)).toEqual(project);
  });

  it("returns null when the scoped lookup finds nothing", async () => {
    expect(await findProjectForUser(createFakeDb({ project: undefined }), "p1", user)).toBeNull();
  });
});

describe("resolveProjectOwner", () => {
  it("returns the viewer directly, without querying, when they own the project", async () => {
    const project = { id: "p1", ownerId: user.id } as Project;
    const db = {
      query: {
        users: {
          findFirst: async () => {
            throw new Error("should not query when the viewer already is the owner");
          },
        },
      },
    } as unknown as Database;
    expect(await resolveProjectOwner(db, project, user)).toBe(user);
  });

  // The bug this pins: an admin can load any project (findProjectForUser),
  // so the row whose role limit governs a schedule must be looked up from
  // the project's own ownerId, never assumed to be the session's viewer.
  it("resolves the project's owner row, not the viewer, when they differ", async () => {
    const project = { id: "p1", ownerId: user.id } as Project;
    const db = { query: { users: { findFirst: async () => user } } } as unknown as Database;
    expect(await resolveProjectOwner(db, project, admin)).toBe(user);
  });

  it("throws rather than silently falling back if the owner FK somehow doesn't resolve", async () => {
    const project = { id: "p1", ownerId: "missing-owner" } as Project;
    const db = { query: { users: { findFirst: async () => undefined } } } as unknown as Database;
    await expect(resolveProjectOwner(db, project, admin)).rejects.toThrow("Project owner not found");
  });
});

describe("canAccessStorageKey", () => {
  it("is always true for admins without querying", async () => {
    expect(await canAccessStorageKey(createFakeDb({ joinRows: [] }), admin, "ab/cd/x.webp")).toBe(true);
  });

  it("is true when an owned shot references the key", async () => {
    expect(await canAccessStorageKey(createFakeDb({ joinRows: [{ id: "s1" }] }), user, "ab/cd/x.webp")).toBe(
      true,
    );
  });

  it("is false when no owned shot references the key", async () => {
    expect(await canAccessStorageKey(createFakeDb({ joinRows: [] }), user, "ab/cd/x.webp")).toBe(false);
  });
});

describe("canAccessFaviconKey", () => {
  it("is always true for admins without querying", async () => {
    expect(await canAccessFaviconKey(createFakeDb({ joinRows: [] }), admin, "ab.ico")).toBe(true);
  });

  it("is true when an owned project carries the key", async () => {
    expect(await canAccessFaviconKey(createFakeDb({ joinRows: [{ id: "p1" }] }), user, "ab.ico")).toBe(true);
  });

  it("is false when no owned project carries the key", async () => {
    expect(await canAccessFaviconKey(createFakeDb({ joinRows: [] }), user, "ab.ico")).toBe(false);
  });
});

describe("canAccessComparison", () => {
  it("is always true for admins without querying", async () => {
    expect(await canAccessComparison(createFakeDb({ joinRows: [] }), admin, "c1")).toBe(true);
  });

  it("is true when an owned comparison is found", async () => {
    expect(await canAccessComparison(createFakeDb({ joinRows: [{ id: "c1" }] }), user, "c1")).toBe(true);
  });

  it("is false when no owned comparison is found", async () => {
    expect(await canAccessComparison(createFakeDb({ joinRows: [] }), user, "c1")).toBe(false);
  });
});
