import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setRegistrationOpen } from "./clerk-admin.js";

interface RecordedCall {
  path: string;
  body: Record<string, unknown>;
}

function stubFetch(respond: (call: RecordedCall, index: number) => boolean): RecordedCall[] {
  const calls: RecordedCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { body: string }) => {
      const call: RecordedCall = {
        path: url.replace("https://api.clerk.com/v1", ""),
        body: JSON.parse(init.body) as Record<string, unknown>,
      };
      const ok = respond(call, calls.length);
      calls.push(call);
      return { ok, status: ok ? 200 : 500, text: async () => (ok ? "" : "boom") };
    }),
  );
  return calls;
}

describe("setRegistrationOpen", () => {
  beforeEach(() => {
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_x");
    vi.stubEnv("CLERK_PUBLISHABLE_KEY", "pk_test_x");
    vi.stubEnv("CLERK_ENCRYPTION_KEY", "0".repeat(64));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("flips enforcement first, then the allowlist feature flag", async () => {
    const calls = stubFetch(() => true);

    await setRegistrationOpen(false);

    expect(calls).toEqual([
      { path: "/beta_features/instance_settings", body: { restricted_to_allowlist: true } },
      { path: "/instance/restrictions", body: { allowlist: true } },
    ]);
  });

  it("rolls back enforcement when the second call fails, rethrowing the original error", async () => {
    const calls = stubFetch((call) => call.path !== "/instance/restrictions");

    await expect(setRegistrationOpen(false)).rejects.toThrow("/instance/restrictions failed: 500");

    expect(calls).toEqual([
      { path: "/beta_features/instance_settings", body: { restricted_to_allowlist: true } },
      { path: "/instance/restrictions", body: { allowlist: true } },
      // The compensating call restores the pre-toggle enforcement state.
      { path: "/beta_features/instance_settings", body: { restricted_to_allowlist: false } },
    ]);
  });

  it("still surfaces the original error when the rollback itself fails", async () => {
    const calls = stubFetch((_call, index) => index === 0);

    await expect(setRegistrationOpen(true)).rejects.toThrow("/instance/restrictions failed: 500");
    expect(calls).toHaveLength(3);
  });
});
