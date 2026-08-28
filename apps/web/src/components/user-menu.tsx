"use client";

import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useClerk, useUser } from "@clerk/nextjs";
import type { UserRole } from "@vrt/shared/constants";
import { ROLE_DOT_CLASS, ROLE_LABEL } from "@/lib/role-display";
import { SettingsIcon, SignOutIcon, SlidersIcon } from "./icons";
import { RoleBadge } from "./settings/role-badge";
import { USER_MENU_ITEM_CLASS, UserMenuFrame } from "./user-menu-frame";

// Custom replacement for Clerk's <UserButton>: same avatar trigger, but the
// dropdown is our own Radix menu styled with the app's design tokens, and it
// can carry app-specific items (the admin's Settings link) that Clerk's
// prebuilt menu can't. Account actions still go through Clerk's client API
// (openUserProfile / signOut) rather than hand-rolled routes. The chrome
// itself - trigger, panel, Help & FAQ / About VRT - lives in UserMenuFrame,
// shared with none mode's LocalUserMenu.
export function UserMenu({ role }: { role: UserRole }) {
  const { user } = useUser();
  const { openUserProfile, signOut } = useClerk();

  if (!user) {
    return null;
  }

  const email = user.primaryEmailAddress?.emailAddress ?? "";
  const name = user.fullName ?? user.username ?? email;

  return (
    <UserMenuFrame
      triggerLabel={`Account menu (${ROLE_LABEL[role]})`}
      trigger={
        <>
          {/* Clerk's imageUrl is an external host, so next/image would need a
              remotePatterns entry for a 30px avatar - a plain img is fine. */}
          <img src={user.imageUrl} alt="" className="h-full w-full rounded-full object-cover" />
          {/* Role marker, ringed in the header's own colour so it reads as a
              badge on top of the photo rather than part of it. */}
          <span
            className={`absolute -bottom-px -right-px h-2.5 w-2.5 rounded-full ring-2 ring-surface ${ROLE_DOT_CLASS[role]}`}
          />
        </>
      }
      header={
        <>
          <img src={user.imageUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text">{name}</p>
            <p className="truncate text-xs text-text-muted">{email}</p>
            <span className="mt-1 flex text-xs font-semibold">
              <RoleBadge role={role} withLabel />
            </span>
          </div>
        </>
      }
      footer={
        <>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item
            className={`${USER_MENU_ITEM_CLASS} text-danger data-[highlighted]:bg-danger-soft data-[highlighted]:text-danger`}
            onSelect={() => void signOut({ redirectUrl: "/" })}
          >
            <SignOutIcon className="h-4 w-4" />
            Sign out
          </DropdownMenu.Item>
        </>
      }
    >
      <DropdownMenu.Item className={USER_MENU_ITEM_CLASS} onSelect={() => openUserProfile()}>
        <SettingsIcon className="h-4 w-4 text-text-muted" />
        Manage account
      </DropdownMenu.Item>
      {role === "admin" && (
        <DropdownMenu.Item asChild>
          <Link href="/settings" className={USER_MENU_ITEM_CLASS}>
            <SlidersIcon className="h-4 w-4 text-text-muted" />
            Settings
          </Link>
        </DropdownMenu.Item>
      )}
    </UserMenuFrame>
  );
}
