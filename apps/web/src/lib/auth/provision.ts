import { count, eq, isNotNull, sql } from "drizzle-orm";
import { db, users, type Database, type UserRow } from "@vrt/db";
import { DEFAULT_USER_ID, DEFAULT_USER_EMAIL, type UserRole } from "@vrt/shared/constants";

// The first Clerk user bootstraps as admin. The count deliberately excludes
// the none-mode default user (clerk_id NULL): a local database switched to
// clerk mode already contains that row, and counting it would leave the
// instance with no admin anyone can sign in as.
export function jitRoleFor(clerkUserCount: number): UserRole {
  return clerkUserCount === 0 ? "admin" : "user";
}

export async function getOrCreateDefaultUser(database: Database = db): Promise<UserRow> {
  const existing = await database.query.users.findFirst({ where: eq(users.id, DEFAULT_USER_ID) });
  if (existing) {
    return existing;
  }
  // Concurrent first requests race on this insert; the fixed id makes
  // ON CONFLICT DO NOTHING resolve the race, and the re-select below reads
  // whichever request won.
  await database
    .insert(users)
    .values({ id: DEFAULT_USER_ID, email: DEFAULT_USER_EMAIL, role: "admin" })
    .onConflictDoNothing();
  const created = await database.query.users.findFirst({ where: eq(users.id, DEFAULT_USER_ID) });
  if (!created) {
    throw new Error("Failed to create the default user");
  }
  return created;
}

export async function provisionClerkUser(
  database: Database,
  clerkId: string,
  email: string,
): Promise<UserRow> {
  return database.transaction(async (tx) => {
    // Serializes first-login provisioning: without the lock, two concurrent
    // first logins both count zero clerk users and both become admin.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('vrt-user-provision'))`);
    const existing = await tx.query.users.findFirst({ where: eq(users.clerkId, clerkId) });
    if (existing) {
      return existing;
    }
    const [row] = await tx.select({ value: count() }).from(users).where(isNotNull(users.clerkId));
    const [created] = await tx
      .insert(users)
      .values({ clerkId, email, role: jitRoleFor(row?.value ?? 0) })
      .returning();
    if (!created) {
      throw new Error("Failed to provision user");
    }
    return created;
  });
}
