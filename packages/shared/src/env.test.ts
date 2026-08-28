import { describe, expect, it } from "vitest";
import {
  authEnvSchema,
  clerkEnvSchema,
  databaseEnvSchema,
  isMailConfigured,
  mailConfigFrom,
  redisEnvSchema,
  storageEnvSchema,
} from "./env.js";

describe("databaseEnvSchema", () => {
  it("throws a message naming the missing variable", () => {
    expect(() => databaseEnvSchema.parse({})).toThrow(/DATABASE_URL/);
  });

  it("accepts a set url and ignores unrelated variables", () => {
    const parsed = databaseEnvSchema.parse({ DATABASE_URL: "postgres://x", OTHER: "y" });
    expect(parsed).toEqual({ DATABASE_URL: "postgres://x" });
  });
});

describe("redisEnvSchema", () => {
  it("throws a message naming the missing variable", () => {
    expect(() => redisEnvSchema.parse({})).toThrow(/REDIS_URL/);
  });
});

describe("storageEnvSchema", () => {
  it("defaults the driver to local", () => {
    const parsed = storageEnvSchema.parse({ STORAGE_LOCAL_PATH: "/data/shots" });
    expect(parsed.STORAGE_DRIVER).toBe("local");
  });

  it("rejects an unsupported driver", () => {
    expect(() => storageEnvSchema.parse({ STORAGE_DRIVER: "s3", STORAGE_LOCAL_PATH: "/data" })).toThrow(
      /STORAGE_DRIVER/,
    );
  });

  it("requires the local path", () => {
    expect(() => storageEnvSchema.parse({})).toThrow(/STORAGE_LOCAL_PATH/);
  });

  it("keeps the url prefix optional", () => {
    const parsed = storageEnvSchema.parse({ STORAGE_LOCAL_PATH: "/data/shots" });
    expect(parsed.STORAGE_URL_PREFIX).toBeUndefined();
  });
});

describe("authEnvSchema", () => {
  it("defaults AUTH_MODE to none", () => {
    expect(authEnvSchema.parse({}).AUTH_MODE).toBe("none");
  });

  it("accepts clerk", () => {
    expect(authEnvSchema.parse({ AUTH_MODE: "clerk" }).AUTH_MODE).toBe("clerk");
  });

  it("rejects unknown modes", () => {
    expect(() => authEnvSchema.parse({ AUTH_MODE: "basic" })).toThrow();
  });
});

describe("clerkEnvSchema", () => {
  it("requires all three keys with named messages", () => {
    const result = clerkEnvSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual(
        expect.arrayContaining([
          "CLERK_SECRET_KEY is not set",
          "CLERK_PUBLISHABLE_KEY is not set",
          "CLERK_ENCRYPTION_KEY is not set",
        ]),
      );
    }
  });

  it("passes with all three keys set", () => {
    expect(
      clerkEnvSchema.parse({
        CLERK_SECRET_KEY: "sk_test_x",
        CLERK_PUBLISHABLE_KEY: "pk_test_x",
        CLERK_ENCRYPTION_KEY: "deadbeef",
      }),
    ).toEqual({
      CLERK_SECRET_KEY: "sk_test_x",
      CLERK_PUBLISHABLE_KEY: "pk_test_x",
      CLERK_ENCRYPTION_KEY: "deadbeef",
    });
  });
});

describe("mailConfigFrom", () => {
  const full = {
    SMTP_URL: "smtp://u:p@host:587",
    MAIL_FROM: "VRT <vrt@example.com>",
    APP_URL: "http://localhost:3000",
  };

  it("returns null when nothing is set - e-mail is simply off", () => {
    expect(mailConfigFrom({})).toBeNull();
    expect(isMailConfigured({})).toBe(false);
  });

  // Compose and scripts/dev.mjs default APP_URL, so an instance that just
  // doesn't send mail always has it set. That is "off", not "half".
  it("returns null when only APP_URL is set", () => {
    expect(mailConfigFrom({ APP_URL: "http://localhost:3000" })).toBeNull();
    expect(isMailConfigured({ APP_URL: "http://localhost:3000" })).toBe(false);
  });

  // A malformed APP_URL on an instance that doesn't send mail is not an
  // error: the switch is read before APP_URL is validated, so a typo there
  // can't take the UI down through getMailConfigured().
  it("returns null when only APP_URL is set and it is malformed", () => {
    expect(mailConfigFrom({ APP_URL: "localhost" })).toBeNull();
    expect(isMailConfigured({ APP_URL: "localhost" })).toBe(false);
  });

  it("treats empty strings as unset (docker compose passes ${VAR:-})", () => {
    expect(mailConfigFrom({ SMTP_URL: "", MAIL_FROM: "", APP_URL: "" })).toBeNull();
  });

  it("returns the config when all three are set", () => {
    expect(mailConfigFrom(full)).toEqual({
      smtpUrl: "smtp://u:p@host:587",
      from: "VRT <vrt@example.com>",
      appUrl: "http://localhost:3000",
    });
    expect(isMailConfigured(full)).toBe(true);
  });

  it("strips a trailing slash from APP_URL so links join cleanly", () => {
    expect(mailConfigFrom({ ...full, APP_URL: "https://vrt.example.com/" })?.appUrl).toBe(
      "https://vrt.example.com",
    );
  });

  it("throws naming the missing variables when only one half of the switch is set", () => {
    expect(() => mailConfigFrom({ SMTP_URL: "smtp://u:p@host:587" })).toThrow(/MAIL_FROM, APP_URL/);
    expect(() => isMailConfigured({ MAIL_FROM: "VRT <vrt@example.com>" })).toThrow(/SMTP_URL, APP_URL/);
  });

  // The default APP_URL must not be named as missing when it is right there.
  it("names only the missing variable when APP_URL is set", () => {
    const partial = { SMTP_URL: "smtp://u:p@host:587", APP_URL: "http://localhost:3000" };
    expect(() => mailConfigFrom(partial)).toThrow(/MAIL_FROM/);
    expect(() => mailConfigFrom(partial)).not.toThrow(/APP_URL/);
  });

  it("throws when the switch is on but APP_URL - the link base - is missing", () => {
    expect(() =>
      mailConfigFrom({ SMTP_URL: "smtp://u:p@host:587", MAIL_FROM: "VRT <vrt@example.com>" }),
    ).toThrow(/missing APP_URL/);
  });

  // Only once the switch is on: with SMTP_URL and MAIL_FROM set, APP_URL is
  // the link base and a malformed one is a real misconfiguration.
  it("rejects an APP_URL that is not a URL when the SMTP variables are set", () => {
    expect(() =>
      mailConfigFrom({ SMTP_URL: full.SMTP_URL, MAIL_FROM: full.MAIL_FROM, APP_URL: "localhost" }),
    ).toThrow(/APP_URL/);
  });
});
