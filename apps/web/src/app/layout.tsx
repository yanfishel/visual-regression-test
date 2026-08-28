import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import * as Tooltip from "@radix-ui/react-tooltip";
import { ClerkProvider } from "@clerk/nextjs";
import { clerkEnvSchema } from "@vrt/shared/env";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { LiveProvider } from "@/components/live/live-provider";
import { TimeZoneProvider } from "@/components/time-zone-provider";
import { ToastProvider } from "@/components/toast";
import { getAuthMode } from "@/lib/auth/mode";
import { getOptionalUser } from "@/lib/auth/user";
import { isAdmin } from "@/lib/authz";
import { TIME_ZONE_COOKIE, TIME_ZONE_COOKIE_MAX_AGE } from "@/lib/time-zone";
import { getViewerTimeZone } from "@/lib/viewer-time-zone";
import "./globals.css";

// The header renders on every route and reads request-time auth state from
// the database (getOptionalUser), so nothing in this app can be statically
// prerendered - including the auto-generated /_not-found page, which is
// otherwise the one static route left and makes `next build` fail in
// environments with no database (CI). Declared once here instead of
// per-page: it applies to every child segment.
export const dynamic = "force-dynamic";

const DESCRIPTION =
  "Self-hosted visual regression testing: screenshot a project's pages across viewports and review perceptual diffs against approved baselines.";

export const metadata: Metadata = {
  title: {
    default: "Visual Regression Test",
    template: "%s · Visual Regression Test",
  },
  description: DESCRIPTION,
  applicationName: "Visual Regression Test",
  openGraph: {
    title: "Visual Regression Test",
    description: DESCRIPTION,
    siteName: "Visual Regression Test",
    type: "website",
  },
  // Self-hosted internal tool: keep it out of search engines by default.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5fb" },
    { media: "(prefers-color-scheme: dark)", color: "#110e1a" },
  ],
};

// Mirrors components/theme-menu.tsx: "light" / "dark" are explicit
// overrides, anything else (no key = the default) follows the OS.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("vrt-theme");
    var dark =
      stored === "dark" ||
      (stored !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  } catch (e) {}
})();
`;

// Tells the server the viewer's time zone for the *next* request, so run
// timestamps render in it straight away instead of flashing from UTC after
// hydration (components/local-time.tsx). Refreshed on every load: a laptop
// that flew somewhere shows the new zone from its second page on.
const TIME_ZONE_INIT_SCRIPT = `
(function () {
  try {
    var zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone) {
      document.cookie = "${TIME_ZONE_COOKIE}=" + encodeURIComponent(zone) +
        "; path=/; max-age=${TIME_ZONE_COOKIE_MAX_AGE}; SameSite=Lax";
    }
  } catch (e) {}
})();
`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const mode = getAuthMode();
  // `getOptionalUser` is cache()-wrapped, so this shares the lookup the header
  // already makes. Admins see the whole installation's queue in the worker
  // indicators; everyone else sees only their own runs.
  const [user, timeZone] = await Promise.all([getOptionalUser(), getViewerTimeZone()]);
  const scopeToOwnRuns = user !== null && !isAdmin(user);
  const shell = (
    <LiveProvider scopeToOwnRuns={scopeToOwnRuns}>
      <TimeZoneProvider timeZone={timeZone}>
        <Tooltip.Provider delayDuration={200}>
          {/* Toasts are app-wide for the same reason tooltips are: the viewport
            is one fixed overlay, and any client component under it can fire
            into it without threading state through the tree. */}
          <ToastProvider>
            <Header />
            {children}
            <Footer />
          </ToastProvider>
        </Tooltip.Provider>
      </TimeZoneProvider>
    </LiveProvider>
  );
  return (
    // The theme-init script below sets `class="dark"` on <html> before
    // hydration, which React would otherwise report as a mismatch against the
    // server's class-less markup. The divergence is the point, so silence it
    // for this element only - it does not extend to children.
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        <Script id="time-zone-init" strategy="beforeInteractive">
          {TIME_ZONE_INIT_SCRIPT}
        </Script>
      </head>
      <body className="flex min-h-screen flex-col bg-bg text-text">
        {mode === "clerk" ? (
          // The publishable key is read at request time and passed as a prop
          // (not NEXT_PUBLIC_*) so one build serves any Clerk instance.
          // Auth happens in Clerk's modals (no /sign-in or /sign-up pages),
          // and finishing either flow lands on the project list.
          <ClerkProvider
            dynamic
            publishableKey={clerkEnvSchema.parse(process.env).CLERK_PUBLISHABLE_KEY}
            signInFallbackRedirectUrl="/projects"
            signUpFallbackRedirectUrl="/projects"
          >
            {shell}
          </ClerkProvider>
        ) : (
          shell
        )}
      </body>
    </html>
  );
}
