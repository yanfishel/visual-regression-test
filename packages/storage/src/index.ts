import { storageEnvSchema } from "@vrt/shared/env";
import { LocalStorage } from "./local.js";
import type { Storage } from "./types.js";

export type { Storage } from "./types.js";
export { LocalStorage } from "./local.js";

// STORAGE_DRIVER selects the driver; only "local" exists today. Adding a second
// one is the R2 migration path described in CLAUDE.md section 7.
export function createStorageFromEnv(): Storage {
  const env = storageEnvSchema.parse(process.env);
  return new LocalStorage({ rootDir: env.STORAGE_LOCAL_PATH, urlPrefix: env.STORAGE_URL_PREFIX });
}
