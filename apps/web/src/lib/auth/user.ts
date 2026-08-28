import { cache } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, users, type Database, type UserRow } from "@vrt/db";
import { getAuthMode } from "./mode.js";
import { getOrCreateDefaultUser, provisionClerkUser } from "./provision.js";
import { SIGN_IN_HREF } from "../query-params.js";

// The only module that knows which auth mode is active. Everything else
// calls getCurrentUser/getOptionalUser/requireAdmin and works identically
// in both modes.
//
// @clerk/nextjs/server is imported dynamically so none-mode never loads (or
// validates) anything Clerk-related.
const loadOptionalUser = async (database: Database = db): Promise<UserRow | null> => {
  if (getAuthMode() === "none") {
    return getOrCreateDefaultUser(database);
  }

  const { auth, currentUser } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  if (!userId) {
    return null;
  }

  const existing = await database.query.users.findFirst({ where: eq(users.clerkId, userId) });
  if (existing) {
    return existing;
  }

  // First login: currentUser() is a real Backend API call, so it only runs
  // on the JIT miss, never on the hot path.
  const clerkUser = await currentUser();
  const email =
    clerkUser?.primaryEmailAddress?.emailAddress ?? clerkUser?.emailAddresses[0]?.emailAddress ?? "";
  return provisionClerkUser(database, userId, email);
};

// Wrapped in React's cache() so the header and the page it wraps - both of
// which call getOptionalUser() with no args on the same request - share one
// DB lookup instead of two. Keyed by argument identity, so tests that each
// pass their own fake `database` object never collide with each other or
// with a real request's default `db` singleton.
export const getOptionalUser = cache(loadOptionalUser);

export async function getCurrentUser(database: Database = db): Promise<UserRow> {
  const user = await getOptionalUser(database);
  if (!user) {
    redirect(SIGN_IN_HREF);
  }
  return user;
}

export async function requireAdmin(database: Database = db): Promise<UserRow> {
  const user = await getCurrentUser(database);
  if (user.role !== "admin") {
    redirect("/projects");
  }
  return user;
}
