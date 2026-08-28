"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { UserRole } from "@vrt/shared/constants";
import { RoleSelect } from "./role-select";
import { SETTINGS_TAB_QUERY_PARAM, USER_ROLE_QUERY_PARAM, USER_SEARCH_QUERY_PARAM } from "@/lib/query-params";
import { SearchIcon } from "../icons";

// Search box and role filter for the /settings user table. Same shape as the
// /projects toolbar: the list state lives in the URL and the server page stays
// the one place that filters and paginates. Every change drops the page param
// - a new search or role starts from page one - and re-pins `tab=users` so the
// reload lands back on this panel.
export function UsersToolbar({
  query,
  role,
  total,
}: {
  query: string;
  role: UserRole | null;
  total: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [text, setText] = useState(query);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  function navigate(nextQuery: string, nextRole: UserRole | null) {
    const params = new URLSearchParams();
    params.set(SETTINGS_TAB_QUERY_PARAM, "users");
    if (nextQuery.trim()) {
      params.set(USER_SEARCH_QUERY_PARAM, nextQuery.trim());
    }
    if (nextRole) {
      params.set(USER_ROLE_QUERY_PARAM, nextRole);
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function handleTextChange(value: string) {
    setText(value);
    if (debounce.current) {
      clearTimeout(debounce.current);
    }
    debounce.current = setTimeout(() => navigate(value, role), 300);
  }

  useEffect(() => {
    return () => {
      if (debounce.current) {
        clearTimeout(debounce.current);
      }
    };
  }, []);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {/* Full width of its own row below `sm`, so the count and the role
          filter wrap underneath instead of squeezing the search box down to
          its icon - the group beside it is `shrink-0` and would win. */}
      <label className="relative w-full min-w-0 sm:w-auto sm:max-w-xs sm:flex-1">
        <span className="sr-only">Search users</span>
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint" />
        <input
          type="search"
          value={text}
          onChange={(event) => handleTextChange(event.target.value)}
          placeholder="Search by email"
          className="field-input h-9 w-full pl-9"
        />
      </label>

      <div className="flex shrink-0 items-center gap-3">
        <p className="font-mono text-xs text-text-faint">
          {total} {total === 1 ? "user" : "users"}
        </p>
        {/* The same dropdown as the per-row role picker - the two are the
            same control on the same screen and should look it - with the
            extra "All roles" entry. `null` means no filter, and a query
            param only exists for a real role. */}
        <RoleSelect
          ariaLabel="Filter by role"
          value={role}
          includeAllOption
          onValueChange={(next) => navigate(text, next)}
          className="w-36"
        />
      </div>
    </div>
  );
}
