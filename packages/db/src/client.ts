import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { databaseEnvSchema } from "@vrt/shared/env";
import * as schema from "./schema.js";

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

let instance: DrizzleDb | undefined;

// `next dev` re-evaluates this module on every HMR compile, so outside
// production the instance must survive module re-evaluation or each compile
// opens a fresh 10-connection pool and never closes the old one (observed
// saturating Postgres' 100-connection cap in one dev session). globalThis is
// the only thing that outlives the module graph.
const CACHE_KEY = Symbol.for("vrt.db.instance");
const globalCache = globalThis as Record<symbol, DrizzleDb | undefined>;

// Connecting only on first use (not at module load) matters because this
// module gets imported - not necessarily called - during `next build`'s
// page-data collection, which runs before DATABASE_URL is available.
function getDb(): DrizzleDb {
  if (!instance) {
    const production = process.env.NODE_ENV === "production";
    if (!production && globalCache[CACHE_KEY]) {
      instance = globalCache[CACHE_KEY];
    } else {
      const { DATABASE_URL } = databaseEnvSchema.parse(process.env);
      instance = drizzle(postgres(DATABASE_URL), { schema });
      if (!production) {
        globalCache[CACHE_KEY] = instance;
      }
    }
  }
  return instance;
}

export const db: DrizzleDb = new Proxy({} as DrizzleDb, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

// Omits `$client`: that property only exists on the top-level connection
// returned by `drizzle()`, not on the `tx` a `db.transaction(async (tx) =>
// ...)` callback receives (`PgTransaction`, which has every query method
// `DrizzleDb` has but isn't a `postgres-js` client itself). Functions that
// must run either as a plain query or inside a transaction - e.g. the quota
// and authz helpers - take `Database` so both `db` and `tx` satisfy it.
export type Database = Omit<DrizzleDb, "$client">;
