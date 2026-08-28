import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { DEFAULT_USER_EMAIL, DEFAULT_USER_ID, VIEWPORT_PRESETS, type ViewportPresetId } from "@vrt/shared";
import { databaseEnvSchema } from "@vrt/shared/env";
import * as schema from "./schema.js";
import { pages, projects, users, viewports } from "./schema.js";

// Demo projects for a fresh instance. Viewports are named by preset id so seeded projects look exactly like ones
// created through the UI.
const seedProjects: {
  name: string;
  baseUrl: string;
  diffThreshold: number;
  pages: { path: string; label: string; maskSelectors: string[] }[];
  viewportPresetIds: ViewportPresetId[];
}[] = [
  {
    name: "example.com",
    baseUrl: "https://example.com",
    diffThreshold: 0.01,
    pages: [{ path: "/", label: "home", maskSelectors: [] }],
    viewportPresetIds: ["desktop"],
  },
  {
    name: "playwright.dev",
    baseUrl: "https://playwright.dev",
    diffThreshold: 0.01,
    pages: [
      { path: "/", label: "home", maskSelectors: [] },
      { path: "/docs/intro", label: "docs-intro", maskSelectors: [] },
    ],
    viewportPresetIds: ["desktop", "mobile"],
  },
];

async function main(): Promise<void> {
  const { DATABASE_URL } = databaseEnvSchema.parse(process.env);

  // The script owns its connection (instead of importing the shared lazy
  // client) so it can close it deterministically: an open socket keeps the
  // event loop alive, and on an error the process would hang instead of
  // exiting 1.
  const client = postgres(DATABASE_URL, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    // Seeded projects belong to the none-mode default user; the migration
    // creates it, but a partially-reset dev database might not have it.
    await db
      .insert(users)
      .values({ id: DEFAULT_USER_ID, email: DEFAULT_USER_EMAIL, role: "admin" })
      .onConflictDoNothing();

    for (const seed of seedProjects) {
      // There is no unique constraint on projects.name, so idempotency has to
      // be a lookup: re-running the seed must not duplicate projects.
      const existing = await db.query.projects.findFirst({ where: eq(projects.name, seed.name) });
      if (existing) {
        console.log(`Project "${seed.name}" already exists (${existing.id}), skipping.`);
        continue;
      }

      await db.transaction(async (tx) => {
        const [project] = await tx
          .insert(projects)
          .values({
            name: seed.name,
            baseUrl: seed.baseUrl,
            ownerId: DEFAULT_USER_ID,
            diffThreshold: seed.diffThreshold,
          })
          .returning();
        if (!project) {
          throw new Error(`Failed to insert project "${seed.name}"`);
        }

        await tx.insert(pages).values(
          seed.pages.map((page) => ({
            projectId: project.id,
            path: page.path,
            label: page.label,
            maskSelectors: page.maskSelectors,
          })),
        );

        await tx.insert(viewports).values(
          VIEWPORT_PRESETS.filter((preset) => seed.viewportPresetIds.includes(preset.id)).map((preset) => ({
            projectId: project.id,
            label: preset.label,
            width: preset.width,
            height: preset.height,
            deviceScaleFactor: preset.deviceScaleFactor,
          })),
        );

        console.log(`Seeded project "${project.name}" (${project.id})`);
      });
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
