"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import * as Tabs from "@radix-ui/react-tabs";
import { SETTINGS_TAB_QUERY_PARAM } from "@/lib/query-params";
import type { SettingsTab } from "@/lib/user-filters";

const TAB_LABELS: { value: SettingsTab; label: string }[] = [
  { value: "users", label: "Users" },
  { value: "limits", label: "Role limits" },
  { value: "auth", label: "Auth" },
];

// Controlled off the URL, not internal Radix state: the users panel's search
// and page live in the query string too, so a single `tab` param keeps the
// whole screen reloadable and linkable. Panels arrive as props so their
// contents stay server-rendered - this component only switches between them.
export function SettingsTabs({
  tab,
  users,
  limits,
  auth,
}: {
  tab: SettingsTab;
  users: ReactNode;
  limits: ReactNode;
  auth: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  // Switching tabs drops every other param: the user search and page belong
  // to the users panel alone, and carrying them onto another tab would just
  // resurrect a stale filter when the reader comes back.
  function selectTab(next: string) {
    const suffix = next === "users" ? "" : `?${SETTINGS_TAB_QUERY_PARAM}=${next}`;
    router.replace(`${pathname}${suffix}`, { scroll: false });
  }

  return (
    // The tab strip lives inside the panel, not above it: the sections are
    // three views of one settings card, so the card's border should enclose
    // the switcher too. The strip's own bottom border is the full-width rule
    // the active trigger's accent underline sits on - hence `-mb-px` on the
    // triggers, so the two borders overlap instead of stacking.
    <Tabs.Root value={tab} onValueChange={selectTab} className="panel">
      <Tabs.List aria-label="Settings sections" className="flex border-b border-border px-2">
        {TAB_LABELS.map((item) => (
          <Tabs.Trigger
            key={item.value}
            value={item.value}
            className="-mb-px border-b-2 border-transparent px-4 py-3 text-sm font-semibold text-text-muted hover:text-text data-[state=active]:border-accent data-[state=active]:text-accent"
          >
            {item.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>

      <Tabs.Content value="users" className="px-5 py-5 outline-none">
        {users}
      </Tabs.Content>
      <Tabs.Content value="limits" className="px-5 py-5 outline-none">
        {limits}
      </Tabs.Content>
      <Tabs.Content value="auth" className="px-5 py-5 outline-none">
        {auth}
      </Tabs.Content>
    </Tabs.Root>
  );
}
