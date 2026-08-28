"use client";

import { useRouter } from "next/navigation";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";

// A table row that *is* the link to its run: click anywhere on it, or focus
// it and press Enter. Ctrl/⌘-click opens a new tab like a real link would.
// The cells stay server-rendered and come in as children; this wrapper only
// adds the navigation and the hover/focus affordance. A row can't be an
// `<a>`, and stretching a link over a `<tr>` needs `position: relative` on
// the row, which table rows don't reliably honour - hence the handler.
export function RunRow({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter();

  function open(event: MouseEvent | KeyboardEvent) {
    if (event.ctrlKey || event.metaKey) {
      window.open(href, "_blank", "noopener");
    } else {
      router.push(href);
    }
  }

  function handleClick(event: MouseEvent<HTMLTableRowElement>) {
    // Text selection is still a thing on a table row.
    if (window.getSelection()?.toString()) {
      return;
    }
    open(event);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTableRowElement>) {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      open(event);
    }
  }

  return (
    <tr
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="cursor-pointer border-t border-border transition-colors hover:bg-surface-alt focus-visible:bg-surface-alt"
    >
      {children}
    </tr>
  );
}
