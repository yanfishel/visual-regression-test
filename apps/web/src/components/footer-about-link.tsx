"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ABOUT_PATH = "/about";

// The footer's way back to the landing page. On /about itself it degrades to
// plain text - same rule as the last `Breadcrumbs` crumb: the current page is
// never a link. A client component only because that needs the pathname.
export function FooterAboutLink() {
  const pathname = usePathname();

  if (pathname === ABOUT_PATH) {
    return (
      <span aria-current="page" className="mr-1 text-sm text-text-faint">
        About
      </span>
    );
  }

  return (
    <Link href={ABOUT_PATH} className="mr-1 text-sm text-text-muted transition hover:text-accent">
      About
    </Link>
  );
}
