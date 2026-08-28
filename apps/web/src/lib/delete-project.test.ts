import { describe, expect, it } from "vitest";
import type { Database, Project, UserRow } from "@vrt/db";
import { deleteProjectOwnedBy } from "./delete-project.js";

const OWNER = { id: "user-1", role: "user" } as UserRow;
const OTHER_USER = { id: "user-2", role: "user" } as UserRow;
const ADMIN = { id: "user-9", role: "admin" } as UserRow;

function createFakeDb(project: Project | undefined) {
  const deleted: unknown[] = [];
  const fakeDb = {
    query: {
      projects: {
        findFirst: async () => project,
      },
    },
    delete: () => ({
      where: async (condition: unknown) => {
        deleted.push(condition);
      },
    }),
  } as unknown as Database;

  return { fakeDb, deleted };
}

describe("deleteProjectOwnedBy", () => {
  it("deletes a project the user owns and reports success", async () => {
    const project = { id: "p1", ownerId: "user-1" } as Project;
    const { fakeDb, deleted } = createFakeDb(project);

    expect(await deleteProjectOwnedBy(fakeDb, "p1", OWNER)).toEqual(project);
    expect(deleted).toHaveLength(1);
  });

  it("refuses to delete a project the scoped lookup does not resolve", async () => {
    // findProjectForUser scopes by owner, so someone else's project resolves
    // to undefined - the delete must never run then.
    const { fakeDb, deleted } = createFakeDb(undefined);

    expect(await deleteProjectOwnedBy(fakeDb, "p1", OTHER_USER)).toBeNull();
    expect(deleted).toHaveLength(0);
  });

  it("lets an admin delete any project", async () => {
    const project = { id: "p1", ownerId: "user-1" } as Project;
    const { fakeDb, deleted } = createFakeDb(project);

    expect(await deleteProjectOwnedBy(fakeDb, "p1", ADMIN)).toEqual(project);
    expect(deleted).toHaveLength(1);
  });
});
