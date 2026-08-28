"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";

// Rendered by the landing page when the sign-in query param is present
// (middleware and getCurrentUser send signed-out visitors there): opens
// Clerk's sign-in modal and strips the param so a refresh or a dismissed
// modal doesn't reopen it. The modal lives on the Clerk singleton, so the
// re-render that unmounts this component leaves it open.
export function SignInOpener() {
  const clerk = useClerk();
  const router = useRouter();

  useEffect(() => {
    clerk.openSignIn();
    router.replace("/", { scroll: false });
  }, [clerk, router]);

  return null;
}
