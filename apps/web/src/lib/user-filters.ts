import type { UserRow } from "@vrt/db";
import type { UserRole } from "@vrt/shared/constants";
import { USER_ROLES } from "@vrt/shared/constants";

export const SETTINGS_TABS = ["users", "limits", "auth"] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

// Filtered in JS rather than SQL on purpose: /settings already loads every
// user row to count them, and this is a single-admin screen with a user list
// measured in tens, not a hot path worth an ILIKE query per keystroke.
export function filterUsers(
  users: UserRow[],
  { query, role }: { query: string; role: UserRole | null },
): UserRow[] {
  const needle = query.trim().toLowerCase();
  return users.filter((user) => {
    if (needle && !user.email.toLowerCase().includes(needle)) {
      return false;
    }
    return role === null || user.role === role;
  });
}

// Unknown or missing values fall back to the first tab instead of 404ing: a
// stale ?tab= link should still open the page.
export function parseSettingsTab(value: unknown): SettingsTab {
  return typeof value === "string" && (SETTINGS_TABS as readonly string[]).includes(value)
    ? (value as SettingsTab)
    : "users";
}

// `null` is the "All roles" option, so an unknown value reads as no filter
// rather than an empty table.
export function parseUserRole(value: unknown): UserRole | null {
  return typeof value === "string" && (USER_ROLES as readonly string[]).includes(value)
    ? (value as UserRole)
    : null;
}
