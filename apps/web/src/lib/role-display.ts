import type { UserRole } from "@vrt/shared/constants";

// One place deciding how a role looks, so the badge before an email, the
// options inside the role dropdown, and the dot on the header avatar can
// never drift apart. A plain module (not a "use client" file): server
// components read these too - see lib/query-params.ts for why that matters.

export const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Admin",
  pro: "Pro",
  user: "User",
};

/** Background for the badge dot. */
export const ROLE_DOT_CLASS: Record<UserRole, string> = {
  admin: "bg-danger",
  pro: "bg-success",
  user: "bg-info",
};

/** Matching foreground, for a label sitting next to the dot. */
export const ROLE_TEXT_CLASS: Record<UserRole, string> = {
  admin: "text-danger",
  pro: "text-success",
  user: "text-info",
};
