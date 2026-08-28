import { clerkEnvSchema } from "@vrt/shared/env";

const CLERK_API_URL = "https://api.clerk.com/v1";

async function clerkPatch(path: string, body: Record<string, unknown>): Promise<void> {
  const { CLERK_SECRET_KEY } = clerkEnvSchema.parse(process.env);
  const response = await fetch(`${CLERK_API_URL}${path}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${CLERK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Clerk API ${path} failed: ${response.status} ${await response.text()}`);
  }
}

// The Backend API has no single "disable sign-ups" switch (checked against
// Clerk's OpenAPI spec; docs/notes/auth.md "Registration toggle"): closing
// registration means
// restricting sign-up to the allowlist while keeping the allowlist empty.
// Both PATCHes are write-only in the API, which is why app_settings mirrors
// the chosen state for display.
//
// Two calls can't be atomic, so: flip the actual enforcement flag
// (restricted_to_allowlist) first, and if the cosmetic allowlist-feature
// toggle then fails, roll the enforcement back before rethrowing - Clerk is
// never left half-toggled. If even the rollback fails, the original error
// still surfaces; the admin's toggle is idempotent, so a retry converges.
export async function setRegistrationOpen(open: boolean): Promise<void> {
  await clerkPatch("/beta_features/instance_settings", { restricted_to_allowlist: !open });
  try {
    await clerkPatch("/instance/restrictions", { allowlist: !open });
  } catch (error) {
    try {
      await clerkPatch("/beta_features/instance_settings", { restricted_to_allowlist: open });
    } catch (rollbackError) {
      console.error("Failed to roll back registration enforcement:", rollbackError);
    }
    throw error;
  }
}
