import { NextResponse, type NextFetchEvent, type NextMiddleware, type NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { SIGN_IN_HREF } from "@/lib/query-params";

// Public in clerk mode: the landing page, at both of its addresses ("/" for
// signed-out visitors, "/about" permanently - see app/page.tsx). Everything
// else (including /api/* - the SSE stream and image routes carry run data)
// requires a session. There are no /sign-in or /sign-up pages - auth runs in
// Clerk's modal, opened by the landing page via SIGN_IN_HREF's query param.
const isPublicRoute = createRouteMatcher(["/", "/about"]);

// Built lazily so none-mode never constructs (or validates the keys of) the
// Clerk middleware at import time.
//
// Explicitly typed as `NextMiddleware`, not `ReturnType<typeof
// clerkMiddleware>`: `clerkMiddleware` is an overloaded call signature and
// TS resolves `ReturnType` against its *last* overload - the direct
// `(request, event) => NextMiddlewareReturn` form - not the
// handler-plus-options form actually used below.
let withClerk: NextMiddleware | undefined;

export default function middleware(request: NextRequest, event: NextFetchEvent) {
  if (process.env.AUTH_MODE !== "clerk") {
    return NextResponse.next();
  }
  withClerk ??= clerkMiddleware(
    async (auth, req) => {
      if (!isPublicRoute(req)) {
        await auth.protect({
          unauthenticatedUrl: new URL(SIGN_IN_HREF, req.url).toString(),
        });
      }
    },
    {
      publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
      secretKey: process.env.CLERK_SECRET_KEY,
    },
  );
  return withClerk(request, event);
}

export const config = {
  matcher: [
    // Skip Next.js internals and static assets, run on everything else
    // including API routes (Clerk's recommended matcher).
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
