import Link from "next/link";
import { SignInButton } from "@clerk/nextjs";
import { getAuthMode } from "@/lib/auth/mode";
import { getOptionalUser } from "@/lib/auth/user";
import { hasRealEmail } from "@/lib/auth/email";
import { getMailConfigured } from "@/lib/mail-status";
import { GitCompareArrowsIcon } from "./icons";
import { LocalUserMenu } from "./local-user-menu";
import { WorkerIndicator } from "./live/worker-indicator";
import { ThemeMenu } from "./theme-menu";
import { UserMenu } from "./user-menu";

export async function Header() {
  const mode = getAuthMode();
  // Optional, not required: the header also renders on the public landing
  // page, where nobody is signed in.
  const user = await getOptionalUser();

  return (
    <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between gap-6 border-b border-border bg-surface/90 px-6 backdrop-blur">
      <div className="flex min-w-0 items-center">
        {/* Home is the project list for anyone the app knows; only a
            signed-out visitor's home is the landing page at "/". Pointing the
            logo straight at /projects saves them the redirect. */}
        <Link href={user ? "/projects" : "/"} className="flex shrink-0 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent text-accent-contrast">
            <GitCompareArrowsIcon className="h-4 w-4" />
          </span>
          {/* The wordmark gives way below `sm`: on a phone it would run
              under the avatar; the logo mark alone still links home. */}
          <span className="hidden whitespace-nowrap text-lg font-bold tracking-tight text-text sm:inline">
            Visual Regression Test
          </span>
        </Link>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {/* Signed-out visitors can't open the SSE stream (401), so the
            indicator would sit in "reconnecting" forever - meaningless noise
            on a public page. Hide it until there's a session behind it. */}
        {(mode !== "clerk" || user !== null) && <WorkerIndicator />}
        {/* Signed-out visitors (clerk mode only - none mode has no login at
            all) get an explicit way into the app; everyone the app knows gets
            an avatar menu instead. None mode has its own (the address
            notifications go to, help, about); the header itself stays free of
            nav in both modes. */}
        {/* All three right-side controls (worker indicator, avatar / sign-in,
            theme menu) share the theme menu's 30px height so the row reads as
            one line; the theme menu sits last. */}
        {mode === "clerk" ? (
          user ? (
            <UserMenu role={user.role} />
          ) : (
            <SignInButton mode="modal">
              <button type="button" className="btn btn-primary h-[30px] py-0">
                Sign in
              </button>
            </SignInButton>
          )
        ) : (
          user && (
            <LocalUserMenu
              email={hasRealEmail(user) ? user.email : null}
              mailConfigured={getMailConfigured()}
            />
          )
        )}
        <ThemeMenu />
      </div>
    </header>
  );
}
