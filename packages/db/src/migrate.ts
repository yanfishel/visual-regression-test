import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { databaseEnvSchema } from "@vrt/shared/env";

async function main(): Promise<void> {
  const { DATABASE_URL } = databaseEnvSchema.parse(process.env);

  const migrationClient = postgres(DATABASE_URL, { max: 1 });
  try {
    const db = drizzle(migrationClient);
    const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));
    await migrate(db, { migrationsFolder });
    console.log("Migrations applied.");
  } finally {
    // Always release the connection: an open socket keeps the event loop
    // alive, so on a failed migration the process would otherwise hang
    // forever instead of exiting 1 - and docker compose, which gates web and
    // worker on this service completing, would wait silently with it.
    await migrationClient.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
