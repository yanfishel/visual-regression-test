import { z } from "zod";

// Zod at every external boundary (CLAUDE.md section 10) includes env vars.
// Each process parses only the slice of process.env it actually needs, and
// only at first use, never at module load - next build imports these modules
// during page-data collection, before the runtime env exists.
//
// The error messages name the variable: these surface in docker compose logs
// where "Required" alone would be useless.

export const databaseEnvSchema = z.object({
  DATABASE_URL: z.string({ required_error: "DATABASE_URL is not set" }).min(1, "DATABASE_URL is not set"),
});

export const redisEnvSchema = z.object({
  REDIS_URL: z.string({ required_error: "REDIS_URL is not set" }).min(1, "REDIS_URL is not set"),
});

// Only "local" exists until the R2 migration path described in CLAUDE.md
// section 7 is needed.
export const storageEnvSchema = z.object({
  STORAGE_DRIVER: z
    .literal("local", { errorMap: () => ({ message: "Unsupported STORAGE_DRIVER: only 'local' exists" }) })
    .default("local"),
  STORAGE_LOCAL_PATH: z
    .string({ required_error: "STORAGE_LOCAL_PATH is not set" })
    .min(1, "STORAGE_LOCAL_PATH is not set"),
  STORAGE_URL_PREFIX: z.string().min(1).optional(),
});

// Mode is a runtime choice, not a build flag: one image serves both modes
// (CLAUDE.md §12). Clerk env vars are validated separately
// and only ever parsed when AUTH_MODE=clerk, so none-mode never requires
// Clerk keys.
export const authEnvSchema = z.object({
  AUTH_MODE: z.enum(["none", "clerk"]).default("none"),
});
export type AuthMode = z.infer<typeof authEnvSchema>["AUTH_MODE"];

// Deliberately NOT NEXT_PUBLIC_*: the publishable key is read server-side at
// request time and handed to <ClerkProvider publishableKey={...}>, so a
// single build works against any Clerk instance.
export const clerkEnvSchema = z.object({
  CLERK_SECRET_KEY: z
    .string({ required_error: "CLERK_SECRET_KEY is not set" })
    .min(1, "CLERK_SECRET_KEY is not set"),
  CLERK_PUBLISHABLE_KEY: z
    .string({ required_error: "CLERK_PUBLISHABLE_KEY is not set" })
    .min(1, "CLERK_PUBLISHABLE_KEY is not set"),
  // Required by @clerk/nextjs because the middleware passes publishableKey/
  // secretKey as explicit options ("dynamic keys") instead of letting Clerk
  // read its own NEXT_PUBLIC_*/CLERK_SECRET_KEY defaults - Clerk needs this
  // to encrypt those options across the middleware -> RSC boundary. Confirmed
  // empirically: middleware throws `Missing CLERK_ENCRYPTION_KEY` at request
  // time (not at build time) without it. A random 32-byte hex string.
  CLERK_ENCRYPTION_KEY: z
    .string({ required_error: "CLERK_ENCRYPTION_KEY is not set" })
    .min(1, "CLERK_ENCRYPTION_KEY is not set"),
});

// E-mail notifications (CLAUDE.md §4 "Notifications"). SMTP_URL + MAIL_FROM are the
// pair that turns the feature on: with neither set an instance simply has
// notifications off and the UI says so. APP_URL is *not* part of that switch -
// docker-compose and scripts/dev.mjs both default it, so "APP_URL alone" is
// the normal state of an instance that doesn't send mail and must not read as
// half-configured (it used to, and 500'd every page through the header).
// Empty strings count as unset because docker-compose passes `${SMTP_URL:-}`
// through. Half a configuration *is* an error, not "off" - mailConfigFrom
// names what is missing so a typo in one variable can't silently disable the
// feature. The switch is parsed on its own (mailSwitchSchema) *before*
// APP_URL is validated: on an instance that doesn't send mail a malformed
// APP_URL must stay harmless, or the `.url()` check would throw out of
// getMailConfigured() and 500 the pages that call it.
const optionalEnvString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const mailSwitchSchema = z.object({
  SMTP_URL: optionalEnvString,
  MAIL_FROM: optionalEnvString,
});

export const mailEnvSchema = mailSwitchSchema.extend({
  APP_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url("APP_URL must be an absolute URL, e.g. https://vrt.example.com").optional(),
  ),
});

export interface MailConfig {
  smtpUrl: string;
  from: string;
  /** Without a trailing slash, so `${appUrl}/projects/…` joins cleanly. */
  appUrl: string;
}

export function mailConfigFrom(env: Record<string, string | undefined>): MailConfig | null {
  // Neither half of the switch set: notifications are off, whatever APP_URL
  // says - and APP_URL is not even looked at, let alone validated.
  const { SMTP_URL, MAIL_FROM } = mailSwitchSchema.parse(env);
  if (SMTP_URL === undefined && MAIL_FROM === undefined) {
    return null;
  }
  const { APP_URL } = mailEnvSchema.parse(env);
  if (SMTP_URL === undefined || MAIL_FROM === undefined || APP_URL === undefined) {
    const missing = [
      SMTP_URL === undefined ? "SMTP_URL" : null,
      MAIL_FROM === undefined ? "MAIL_FROM" : null,
      APP_URL === undefined ? "APP_URL" : null,
    ].filter((key): key is string => key !== null);
    throw new Error(`E-mail is half-configured: missing ${missing.join(", ")}`);
  }
  return {
    smtpUrl: SMTP_URL,
    from: MAIL_FROM,
    appUrl: APP_URL.replace(/\/+$/, ""),
  };
}

export function isMailConfigured(env: Record<string, string | undefined>): boolean {
  return mailConfigFrom(env) !== null;
}
