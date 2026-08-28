"use client";

import { usePathname, useRouter } from "next/navigation";
// Type-only import: lib/project-owners.ts reaches for @vrt/db, and a runtime
// import of it here would pull `postgres` into the browser bundle.
import type { ProjectOwner } from "@/lib/project-owners";
import { ALL_OWNERS_VALUE, PROJECT_OWNER_QUERY_PARAM } from "@/lib/query-params";
import { Combobox, type ComboboxOption } from "./combobox";

/**
 * Admin-only owner filter for /projects. Showing every user's projects at
 * once stops being useful once there are more than a handful, so the default
 * is the viewing admin and the rest of the estate is one choice away.
 *
 * Like every other list control on this screen it only rewrites the query
 * string; the server page stays the single place that filters. Changing the
 * owner drops the search, outcome filter and page - they describe a list that
 * no longer exists.
 */
export function OwnerFilter({
  owners,
  selected,
  viewerId,
}: {
  owners: ProjectOwner[];
  selected: string;
  /** The viewing admin, labelled "Only mine" rather than by their own email. */
  viewerId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  function navigate(next: string) {
    // Always written, even for the default owner: a link that names its
    // filter explicitly keeps meaning the same thing when it is shared or
    // reopened later.
    const params = new URLSearchParams({ [PROJECT_OWNER_QUERY_PARAM]: next });
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  // "Only mine" leads, ahead of even "All users": it is the default and the
  // one entry the admin returns to, and sorting it by email would bury it
  // somewhere in the middle of the list. Everyone else keeps the email order
  // `toOwnerOptions` established.
  const viewer = owners.find((owner) => owner.id === viewerId);
  const others = owners.filter((owner) => owner.id !== viewerId);
  const options: ComboboxOption[] = [
    ...(viewer
      ? [
          {
            value: viewer.id,
            // The viewer's own email stays searchable - they may well type it
            // without thinking of themselves as "mine".
            searchText: `only mine me ${viewer.email}`,
            label: <span className="font-semibold">Only mine</span>,
            meta: viewer.projects,
          },
        ]
      : []),
    {
      value: ALL_OWNERS_VALUE,
      searchText: "all users everyone",
      label: "All users",
      meta: owners.reduce((total, owner) => total + owner.projects, 0),
    },
    ...others.map((owner) => ({
      value: owner.id,
      searchText: owner.email,
      label: owner.email,
      meta: owner.projects,
    })),
  ];

  return (
    <div className="panel px-4 py-3.5">
      <h2 className="text-xs font-bold uppercase tracking-wide text-text-faint">Owner</h2>
      <div className="mt-2">
        <Combobox
          ariaLabel="Filter projects by owner"
          placeholder="Search by email"
          emptyLabel="No matching users"
          value={selected}
          options={options}
          onValueChange={navigate}
        />
      </div>
    </div>
  );
}
