import { describe, expect, it } from "vitest";
import type { UserRow } from "@vrt/db";
import { ALL_OWNERS_VALUE, parseOwnerFilter, toOwnerOptions } from "./project-owners.js";

function user(id: string, email: string): UserRow {
  return { id, email } as UserRow;
}

const ADMIN = user("admin-1", "admin@vrt");

describe("toOwnerOptions", () => {
  it("lists owners by email with their project counts", () => {
    const options = toOwnerOptions(
      [user("u2", "bob@example.com"), user("u1", "ann@example.com")],
      new Map([
        ["u1", 3],
        ["u2", 1],
      ]),
      ADMIN,
    );
    expect(options.map((option) => [option.id, option.email, option.projects])).toEqual([
      ["admin-1", "admin@vrt", 0],
      ["u1", "ann@example.com", 3],
      ["u2", "bob@example.com", 1],
    ]);
  });

  it("always includes the admin, even with no projects of their own", () => {
    const options = toOwnerOptions([], new Map(), ADMIN);
    expect(options).toEqual([{ id: "admin-1", email: "admin@vrt", projects: 0 }]);
  });

  it("does not list the admin twice when they own projects", () => {
    const options = toOwnerOptions([ADMIN], new Map([["admin-1", 2]]), ADMIN);
    expect(options).toEqual([{ id: "admin-1", email: "admin@vrt", projects: 2 }]);
  });
});

describe("parseOwnerFilter", () => {
  const ids = ["admin-1", "u1"];

  it("defaults to the viewing admin when the param is missing", () => {
    expect(parseOwnerFilter(undefined, ids, ADMIN.id)).toBe("admin-1");
  });

  it("accepts the all-owners sentinel", () => {
    expect(parseOwnerFilter(ALL_OWNERS_VALUE, ids, ADMIN.id)).toBe(ALL_OWNERS_VALUE);
  });

  it("accepts a known owner id", () => {
    expect(parseOwnerFilter("u1", ids, ADMIN.id)).toBe("u1");
  });

  // A stale link to a deleted user should land on the default, not on an
  // empty screen with a filter naming somebody who no longer exists.
  it("falls back to the admin for an unknown or malformed id", () => {
    expect(parseOwnerFilter("ghost", ids, ADMIN.id)).toBe("admin-1");
    expect(parseOwnerFilter(["u1"], ids, ADMIN.id)).toBe("admin-1");
  });
});
