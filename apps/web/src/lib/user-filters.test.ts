import { describe, expect, it } from "vitest";
import type { UserRow } from "@vrt/db";
import type { UserRole } from "@vrt/shared/constants";
import { filterUsers, parseSettingsTab, parseUserRole } from "./user-filters.js";

function user(id: string, email: string, role: UserRole = "user"): UserRow {
  return { id, email, role } as UserRow;
}

describe("filterUsers", () => {
  const users = [
    user("u1", "local@vrt", "admin"),
    user("u2", "vrt+clerk_test@example.com", "admin"),
    user("u3", "vrt2+clerk_test@example.com", "pro"),
    user("u4", "yan.fishel@gmail.com", "user"),
  ];

  it("returns everything with no query and no role", () => {
    expect(filterUsers(users, { query: "", role: null })).toEqual(users);
    expect(filterUsers(users, { query: "   ", role: null })).toEqual(users);
  });

  it("matches the email case-insensitively", () => {
    expect(filterUsers(users, { query: "GMAIL", role: null }).map((row) => row.id)).toEqual(["u4"]);
    expect(filterUsers(users, { query: "clerk_test", role: null }).map((row) => row.id)).toEqual([
      "u2",
      "u3",
    ]);
  });

  it("ignores surrounding whitespace", () => {
    expect(filterUsers(users, { query: "  local  ", role: null }).map((row) => row.id)).toEqual(["u1"]);
  });

  it("filters by role", () => {
    expect(filterUsers(users, { query: "", role: "admin" }).map((row) => row.id)).toEqual(["u1", "u2"]);
    expect(filterUsers(users, { query: "", role: "pro" }).map((row) => row.id)).toEqual(["u3"]);
    expect(filterUsers(users, { query: "", role: "user" }).map((row) => row.id)).toEqual(["u4"]);
  });

  it("combines query and role", () => {
    expect(filterUsers(users, { query: "clerk_test", role: "admin" }).map((row) => row.id)).toEqual(["u2"]);
  });

  it("returns nothing when nothing matches", () => {
    expect(filterUsers(users, { query: "nobody", role: null })).toEqual([]);
    expect(filterUsers(users, { query: "local", role: "pro" })).toEqual([]);
  });
});

describe("parseSettingsTab", () => {
  it("accepts only known tab values", () => {
    expect(parseSettingsTab("users")).toBe("users");
    expect(parseSettingsTab("limits")).toBe("limits");
    expect(parseSettingsTab("auth")).toBe("auth");
  });

  it("falls back to the users tab for anything else", () => {
    expect(parseSettingsTab("everything")).toBe("users");
    expect(parseSettingsTab(undefined)).toBe("users");
    expect(parseSettingsTab(["auth"])).toBe("users");
  });
});

describe("parseUserRole", () => {
  it("accepts only known roles", () => {
    expect(parseUserRole("admin")).toBe("admin");
    expect(parseUserRole("pro")).toBe("pro");
    expect(parseUserRole("user")).toBe("user");
  });

  it("reads anything else as no role filter", () => {
    expect(parseUserRole("owner")).toBeNull();
    expect(parseUserRole(undefined)).toBeNull();
    expect(parseUserRole(["admin"])).toBeNull();
  });
});
