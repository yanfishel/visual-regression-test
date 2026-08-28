import { authEnvSchema, type AuthMode } from "@vrt/shared/env";

// Parsed at call time, not module load: next build imports route modules
// during page-data collection, before the runtime env exists (same reason
// as packages/db/src/client.ts).
export function getAuthMode(): AuthMode {
  return authEnvSchema.parse(process.env).AUTH_MODE;
}
