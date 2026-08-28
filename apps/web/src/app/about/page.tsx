import type { Metadata } from "next";
import { LandingContent } from "@/components/landing/landing-content";

export const metadata: Metadata = { title: "About" };

// The plan cards read `role_limits`, so this page can't be prerendered at
// build time with no database around - same reason `/` is dynamic.
export const dynamic = "force-dynamic";

// The landing page's permanent address. `/` shows it only to signed-out
// visitors (everyone else is redirected to their projects), so the header's
// info icon and the footer's "About" link point here instead.
export default function AboutPage() {
  return <LandingContent />;
}
