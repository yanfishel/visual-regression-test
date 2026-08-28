"use client";

import { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { EmailAddressDialog } from "./email-address-dialog";
import { MailIcon, UserIcon } from "./icons";
import { USER_MENU_ITEM_CLASS, UserMenuFrame } from "./user-menu-frame";

// None mode's avatar menu: same trigger and frame as the clerk one, but a
// generic user glyph (no photo to show), no role dot (the default row is
// nominally admin, but role means nothing in none mode) and one own item -
// the e-mail address notifications go to. No Settings (/settings is
// clerk-only: role limits and registration mean nothing here), no sign out.
export function LocalUserMenu({ email, mailConfigured }: { email: string | null; mailConfigured: boolean }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  return (
    <>
      <UserMenuFrame
        triggerLabel="Account menu"
        trigger={
          <span className="flex h-full w-full items-center justify-center rounded-full bg-surface-alt text-text-muted ring-1 ring-border">
            <UserIcon className="h-4 w-4" />
          </span>
        }
        header={
          <>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-alt text-text-muted ring-1 ring-border">
              <UserIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-text">Local user</p>
              <p className="truncate text-xs text-text-muted">{email ?? "No e-mail address yet"}</p>
            </div>
          </>
        }
      >
        <DropdownMenu.Item className={USER_MENU_ITEM_CLASS} onSelect={() => setDialogOpen(true)}>
          <MailIcon className="h-4 w-4 text-text-muted" />
          E-mail address…
        </DropdownMenu.Item>
      </UserMenuFrame>
      {/* Mounted outside the menu: Radix unmounts the dropdown's content on
          close, and the item's onSelect closes the menu. */}
      <EmailAddressDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        email={email}
        mailConfigured={mailConfigured}
      />
    </>
  );
}
