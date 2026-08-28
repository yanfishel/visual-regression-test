import type { ReactNode } from "react";

// The app screens share a centered column; the landing page at the root
// route stays outside this group so it can paint full-bleed sections.
// Top padding is tighter than bottom so the breadcrumb trail sits close
// under the header.
export default function AppLayout({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-5xl flex-1 px-6 pb-10 pt-4">{children}</div>;
}
