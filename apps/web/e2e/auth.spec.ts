import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

// Test users on the Clerk dev instance (CLAUDE.md section 12, docs/notes/auth.md):
// +clerk_test emails never send real mail and the email verification code is
// always 424242. The admin's password is the instance's own secret and comes
// from apps/web/.env (loaded by playwright.config.ts), never from the repo.
const ADMIN_EMAIL = "vrt+clerk_test@example.com";
const USER_EMAIL = "vrt2+clerk_test@example.com";

function adminPassword(): string {
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!password) {
    throw new Error(`E2E_ADMIN_PASSWORD is not set - add the ${ADMIN_EMAIL} password to apps/web/.env`);
  }
  return password;
}

async function signIn(page: Page, identifier: string): Promise<void> {
  await setupClerkTestingToken({ page });
  // clerk.signIn drives the Frontend API directly, so Clerk's JS must be
  // loaded first - any app page under ClerkProvider does. email_code with a
  // +clerk_test address uses the fixed 424242 verification code, matching
  // the instance's email-first auth config.
  await page.goto("/");
  await clerk.signIn({
    page,
    signInParams: { strategy: "email_code", identifier },
  });
}

test("a signed-out visitor is bounced to the landing page with the sign-in modal open", async ({ page }) => {
  await page.goto("/projects");
  // There is no /sign-in page: middleware sends signed-out visitors to the
  // landing page, which auto-opens Clerk's sign-in modal.
  await page.waitForURL((url) => url.pathname === "/");
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
});

test("the landing page is public and offers Sign in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("signing in through the modal lands on the project list", async ({ page }) => {
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in" }).click();
  // Clerk associates the visible label with a wrapper, not the input itself,
  // so getByLabel can't fill it - target the input by its stable name.
  await page.locator('input[name="identifier"]').fill(ADMIN_EMAIL);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  // The instance's first factor for these test users is their password.
  await page.locator('input[name="password"]').fill(adminPassword());
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  // New-device verification follows: the +clerk_test address always accepts
  // the fixed 424242 code. The first OTP segment is auto-focused, so typing
  // into the page fills the segments left to right.
  await expect(page.getByText("Check your email")).toBeVisible();
  await page.keyboard.type("424242");
  await page.waitForURL("**/projects");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
});

test("a signed-in visitor gets the project list as home, with the landing at /about", async ({ page }) => {
  await signIn(page, ADMIN_EMAIL);
  await page.goto("/");
  await page.waitForURL("**/projects");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  // The landing page stays reachable from the footer on every screen...
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "About" })).toBeVisible();
  // ...and from the avatar menu.
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "About VRT" }).click();
  await page.waitForURL("**/about");
  await expect(page.getByRole("heading", { name: "See every pixel that changed" })).toBeVisible();
  // On /about itself the footer entry is plain text, not a link.
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "About" })).toHaveCount(0);
  await expect(page.getByRole("contentinfo").getByText("About")).toBeVisible();
});

test("the admin signs in, sees the project list and the Settings menu item", async ({ page }) => {
  await signIn(page, ADMIN_EMAIL);
  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  // The header has no nav; Settings lives in the avatar dropdown for admins.
  await page.getByRole("button", { name: "Account menu" }).click();
  await expect(page.getByRole("menuitem", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toHaveCount(0);
});

test("a plain user sees no Settings menu item and no admin page", async ({ page }) => {
  await signIn(page, USER_EMAIL);
  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await page.getByRole("button", { name: "Account menu" }).click();
  await expect(page.getByRole("menuitem", { name: "Manage account" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Settings" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  // requireAdmin bounces non-admins back to the project list.
  await page.goto("/settings");
  await page.waitForURL("**/projects");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
});
