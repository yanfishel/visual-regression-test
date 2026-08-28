import { isMailConfigured } from "@vrt/shared/env";

// Server-side only. Read at call time (never module load - next build
// imports route modules before the runtime env exists). A half-configured
// instance throws here on purpose: naming the missing variable in the
// server log beats a toggle that silently never sends. An instance with
// neither SMTP_URL nor MAIL_FROM is not "half" - it just has notifications
// off - so this doesn't fire on a stock install (packages/shared/src/env.ts).
export function getMailConfigured(): boolean {
  return isMailConfigured(process.env);
}
