import { describe, expect, it } from "vitest";
import type { Database, UserRow } from "@vrt/db";
import { DEFAULT_USER_ID, type UserRole } from "@vrt/shared/constants";
import { getOrCreateDefaultUser, jitRoleFor, provisionClerkUser } from "./provision.js";

const defaultUser: UserRow = {
  id: DEFAULT_USER_ID,
  clerkId: null,
  email: "local@vrt",
  role: "admin",
  createdAt: new Date(0),
};

function createFakeDb(options: { existing: UserRow | null; afterInsert: UserRow }): {
  db: Database;
  inserts: number;
} {
  const state = { inserts: 0, created: false };
  const db = {
    query: {
      users: {
        findFirst: async () => (state.created ? options.afterInsert : (options.existing ?? undefined)),
      },
    },
    insert: () => ({
      values: () => ({
        onConflictDoNothing: async () => {
          state.inserts++;
          state.created = true;
        },
      }),
    }),
  } as unknown as Database;
  return {
    db,
    get inserts() {
      return state.inserts;
    },
  };
}

describe("jitRoleFor", () => {
  it("makes the first clerk user an admin", () => {
    expect(jitRoleFor(0)).toBe("admin");
  });

  it("makes every later clerk user a plain user", () => {
    expect(jitRoleFor(1)).toBe("user");
    expect(jitRoleFor(7)).toBe("user");
  });
});

describe("getOrCreateDefaultUser", () => {
  it("returns the existing default user without inserting", async () => {
    const fake = createFakeDb({ existing: defaultUser, afterInsert: defaultUser });
    expect(await getOrCreateDefaultUser(fake.db)).toEqual(defaultUser);
    expect(fake.inserts).toBe(0);
  });

  it("creates the default user when missing", async () => {
    const fake = createFakeDb({ existing: null, afterInsert: defaultUser });
    expect(await getOrCreateDefaultUser(fake.db)).toEqual(defaultUser);
    expect(fake.inserts).toBe(1);
  });
});

type InsertedRow = { clerkId: string; email: string; role: UserRole };

// provisionClerkUser runs its whole body inside database.transaction(fn), so
// the fake models a transaction: `db.transaction` invokes the callback with
// a fake `tx` object shaped like the real one (execute/query/select/insert),
// and captures the values actually passed to insert().values() so the role
// assertion below is on real arguments, not a call-count flag.
function createFakeProvisionDb(options: { existing: UserRow | null; clerkUserCount: number }): {
  db: Database;
  inserted: InsertedRow | null;
} {
  const state: { inserted: InsertedRow | null } = { inserted: null };
  const tx = {
    execute: async () => {},
    query: {
      users: {
        findFirst: async () => options.existing ?? undefined,
      },
    },
    select: () => ({
      from: () => ({
        where: async () => [{ value: options.clerkUserCount }],
      }),
    }),
    insert: () => ({
      values: (values: InsertedRow) => ({
        returning: async () => {
          state.inserted = values;
          return [{ id: "new-user-id", ...values, createdAt: new Date(0) } satisfies UserRow];
        },
      }),
    }),
  };
  const db = {
    transaction: async (fn: (tx: unknown) => unknown) => fn(tx),
  } as unknown as Database;
  return {
    db,
    get inserted() {
      return state.inserted;
    },
  };
}

describe("provisionClerkUser", () => {
  it("makes the first clerk user an admin", async () => {
    const fake = createFakeProvisionDb({ existing: null, clerkUserCount: 0 });
    const result = await provisionClerkUser(fake.db, "user_1", "first@example.com");
    expect(fake.inserted).toEqual({ clerkId: "user_1", email: "first@example.com", role: "admin" });
    expect(result.role).toBe("admin");
  });

  it("makes a later clerk user a plain user", async () => {
    const fake = createFakeProvisionDb({ existing: null, clerkUserCount: 4 });
    const result = await provisionClerkUser(fake.db, "user_2", "later@example.com");
    expect(fake.inserted).toEqual({ clerkId: "user_2", email: "later@example.com", role: "user" });
    expect(result.role).toBe("user");
  });

  it("returns the existing row found inside the lock without inserting", async () => {
    const existing: UserRow = {
      id: "existing-user-id",
      clerkId: "user_3",
      email: "existing@example.com",
      role: "user",
      createdAt: new Date(0),
    };
    const fake = createFakeProvisionDb({ existing, clerkUserCount: 9 });
    const result = await provisionClerkUser(fake.db, "user_3", "existing@example.com");
    expect(result).toEqual(existing);
    expect(fake.inserted).toBeNull();
  });
});
