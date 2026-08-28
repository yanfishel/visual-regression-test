"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { FAQ_SECTION_ID } from "@/lib/landing-sections";
import { HelpCircleIcon, InfoIcon } from "./icons";

export const USER_MENU_ITEM_CLASS =
  "flex cursor-pointer select-none items-center gap-2.5 rounded-sm px-3 py-2 text-sm text-text outline-none data-[highlighted]:bg-surface-alt";

// The avatar dropdown both auth modes share: one 30px round trigger, one
// panel with a header block, the mode's own items, then Help & FAQ and
// About VRT (the FAQ is the app's only help text, CLAUDE.md §9, and comes
// first: help is what a signed-in user opens this menu for far more often
// than the landing page). user-menu.tsx (clerk) and local-user-menu.tsx
// (none) fill the slots; neither duplicates the chrome.
export function UserMenuFrame({
  trigger,
  triggerLabel,
  header,
  children,
  footer,
}: {
  trigger: ReactNode;
  triggerLabel: string;
  header: ReactNode;
  children?: ReactNode;
  // Rendered *after* the shared items, so the clerk menu's Sign out can stay
  // last where the muscle memory expects it.
  footer?: ReactNode;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={triggerLabel}
          // `relative` for the clerk role dot, but no `overflow-hidden`: it
          // would clip the dot. The avatar clips itself instead.
          className="relative h-[30px] w-[30px] shrink-0 rounded-full outline-none ring-accent focus-visible:ring-2"
        >
          {trigger}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={10} className="panel z-30 min-w-60 p-1.5 shadow-lg">
          <div className="flex items-center gap-3 px-3 py-2.5">{header}</div>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          {children}
          <DropdownMenu.Item asChild>
            <Link href={`/about#${FAQ_SECTION_ID}`} className={USER_MENU_ITEM_CLASS}>
              <HelpCircleIcon className="h-4 w-4 text-text-muted" />
              Help &amp; FAQ
            </Link>
          </DropdownMenu.Item>
          {/* The landing page's only entry point once "/" belongs to the
              project list: a returning user's "what is this again?" link. */}
          <DropdownMenu.Item asChild>
            <Link href="/about" className={USER_MENU_ITEM_CLASS}>
              <InfoIcon className="h-4 w-4 text-text-muted" />
              About VRT
            </Link>
          </DropdownMenu.Item>
          {footer}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
