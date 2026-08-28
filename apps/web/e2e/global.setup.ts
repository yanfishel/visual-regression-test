import { clerkSetup } from "@clerk/testing/playwright";

// Obtains a testing token from the Clerk dev instance so the specs can
// bypass bot detection (the sign-up UI is Turnstile-protected otherwise).
export default async function globalSetup(): Promise<void> {
  await clerkSetup({
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
    secretKey: process.env.CLERK_SECRET_KEY,
  });
}
