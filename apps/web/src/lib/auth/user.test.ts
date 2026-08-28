import { afterEach, describe, expect, it, vi } from "vitest";
import type { Database, UserRow } from "@vrt/db";
import { DEFAULT_USER_ID } from "@vrt/shared/constants";

// vi.mock factories are hoisted above imports; referencing outer variables
// inside them requires vi.hoisted so the variables exist by the time the
// factory runs.
const { authMock, currentUserMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  currentUserMock: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
  currentUser: currentUserMock,
}));

// next/navigation's real redirect() throws (it aborts the render via a
// special error) rather than returning - mirror that so getCurrentUser's/
// requireAdmin's own logic after the call under test never accidentally
// executes.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

const { getCurrentUser, getOptionalUser, requireAdmin } = await import("./user.js");

const defaultUser: UserRow = {
  id: DEFAULT_USER_ID,
  clerkId: null,
  email: "local@vrt",
  role: "admin",
  createdAt: new Date(0),
};

const nonAdminUser: UserRow = {
  id: "11111111-1111-4111-8111-111111111111",
  clerkId: "user_x",
  email: "user@example.com",
  role: "user",
  createdAt: new Date(0),
};

function createFakeDb(existing: UserRow | null): Database {
  return {
    query: {
      users: {
        findFirst: async () => existing ?? undefined,
      },
    },
  } as unknown as Database;
}

afterEach(() => {
  vi.unstubAllEnvs();
  authMock.mockReset();
  currentUserMock.mockReset();
});

describe("getOptionalUser", () => {
  it("returns the default user in none mode", async () => {
    vi.stubEnv("AUTH_MODE", "none");
    const db = createFakeDb(defaultUser);

    expect(await getOptionalUser(db)).toEqual(defaultUser);
    expect(authMock).not.toHaveBeenCalled();
  });

  it("resolves null when signed out in clerk mode", async () => {
    vi.stubEnv("AUTH_MODE", "clerk");
    authMock.mockResolvedValue({ userId: null });
    const db = createFakeDb(null);

    expect(await getOptionalUser(db)).toBeNull();
  });

  it("returns the existing row on the hot path without calling currentUser", async () => {
    vi.stubEnv("AUTH_MODE", "clerk");
    authMock.mockResolvedValue({ userId: "user_x" });
    const db = createFakeDb(nonAdminUser);

    expect(await getOptionalUser(db)).toEqual(nonAdminUser);
    expect(currentUserMock).not.toHaveBeenCalled();
  });
});

describe("getCurrentUser", () => {
  it("redirects to the sign-in modal href when signed out", async () => {
    vi.stubEnv("AUTH_MODE", "clerk");
    authMock.mockResolvedValue({ userId: null });
    const db = createFakeDb(null);

    await expect(getCurrentUser(db)).rejects.toThrow("REDIRECT:/?sign-in=1");
  });
});

describe("requireAdmin", () => {
  it("redirects non-admins to /projects", async () => {
    vi.stubEnv("AUTH_MODE", "none");
    const db = createFakeDb(nonAdminUser);

    await expect(requireAdmin(db)).rejects.toThrow("REDIRECT:/projects");
  });
});
