import { redirect } from "next/navigation";
import { LandingContent } from "@/components/landing/landing-content";
import { SignInOpener } from "@/components/sign-in-opener";
import { getAuthMode } from "@/lib/auth/mode";
import { getOptionalUser } from "@/lib/auth/user";
import { SIGN_IN_QUERY_PARAM } from "@/lib/query-params";

// The header now reads the DB (optional user) and runtime env, so the
// landing page must not be prerendered at build time with AUTH_MODE unset
// and no database.
export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // The project list is home for anyone the app knows: every signed-in clerk
  // user, and every visitor in none mode (where getOptionalUser always
  // resolves the default user). The landing stays the public face of `/` for
  // signed-out visitors and keeps a permanent address at /about, linked from
  // the header's info icon and the footer.
  if (await getOptionalUser()) {
    redirect("/projects");
  }

  // Middleware and getCurrentUser send signed-out visitors here with the
  // sign-in param; the opener launches Clerk's modal. Guarded by mode: in
  // none mode there is no ClerkProvider for the opener to talk to.
  const wantsSignIn = getAuthMode() === "clerk" && (await searchParams)[SIGN_IN_QUERY_PARAM] === "1";
  return (
    <>
      {wantsSignIn && <SignInOpener />}
      <LandingContent />
    </>
  );
}
