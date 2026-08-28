"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  PROJECT_FILTER_QUERY_PARAM,
  PROJECT_OWNER_QUERY_PARAM,
  PROJECT_SEARCH_QUERY_PARAM,
} from "@/lib/query-params";
import {
  PROJECT_FILTER_DOT_CLASS,
  PROJECT_FILTER_LABEL,
  type ProjectFilterOption,
} from "@/lib/project-filter-display";
import { PROJECT_FILTERS, type ProjectOutcomeFilter } from "@/lib/project-filters";
import { SearchIcon } from "./icons";
import { SelectMenu, type SelectMenuOption } from "./select-menu";

/** "No filter" needs a value of its own: Radix reserves `""` for "no value". */
const ALL_PROJECTS_VALUE: ProjectFilterOption = "all";

function FilterLabel({ filter }: { filter: ProjectFilterOption }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 shrink-0 rounded-full ${PROJECT_FILTER_DOT_CLASS[filter]}`} />
      {PROJECT_FILTER_LABEL[filter]}
    </span>
  );
}

// Search box + outcome filter for /projects. The list state lives in the URL,
// so the server page stays the single place that filters and paginates; this
// component only rewrites the query string. Every change drops the page param
// - a new filter or search starts from page one.
export function ProjectsToolbar({
  query,
  filter,
  total,
  owner,
}: {
  query: string;
  filter: ProjectOutcomeFilter | null;
  /** Projects matching the current search and filter, not the whole list. */
  total: number;
  /** The admin's owner filter, carried along so searching doesn't drop it. */
  owner?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [text, setText] = useState(query);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Built from props, not useSearchParams: q/filter/page are the only params
  // this list owns, and page must reset on every change anyway.
  function navigate(nextQuery: string, nextFilter: ProjectOutcomeFilter | null) {
    const params = new URLSearchParams();
    if (owner) {
      params.set(PROJECT_OWNER_QUERY_PARAM, owner);
    }
    if (nextQuery.trim()) {
      params.set(PROJECT_SEARCH_QUERY_PARAM, nextQuery.trim());
    }
    if (nextFilter) {
      params.set(PROJECT_FILTER_QUERY_PARAM, nextFilter);
    }
    const suffix = params.toString();
    router.replace(suffix ? `${pathname}?${suffix}` : pathname, { scroll: false });
  }

  function handleTextChange(value: string) {
    setText(value);
    if (debounce.current) {
      clearTimeout(debounce.current);
    }
    debounce.current = setTimeout(() => navigate(value, filter), 300);
  }

  useEffect(() => {
    return () => {
      if (debounce.current) {
        clearTimeout(debounce.current);
      }
    };
  }, []);

  const selected: ProjectFilterOption = filter ?? ALL_PROJECTS_VALUE;
  const options: SelectMenuOption[] = [ALL_PROJECTS_VALUE, ...PROJECT_FILTERS].map((value) => ({
    value,
    label: <FilterLabel filter={value} />,
  }));

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {/* Full width of its own row below `sm`, so the count and the filter wrap
          underneath instead of squeezing the search box down to its icon - the
          group beside it is `shrink-0` and would win. */}
      <label className="relative w-full min-w-0 sm:w-auto sm:max-w-xs sm:flex-1">
        <span className="sr-only">Search projects</span>
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint" />
        <input
          type="search"
          value={text}
          onChange={(event) => handleTextChange(event.target.value)}
          placeholder="Search projects"
          className="field-input h-9 w-full pl-9"
        />
      </label>

      <div className="flex shrink-0 items-center gap-3">
        <p className="font-mono text-xs text-text-faint">
          {total} {total === 1 ? "project" : "projects"}
        </p>
        {/* No tooltip: the segmented control this replaced put a hint on each
            segment, but a dropdown can only carry one on its trigger, where it
            covers the list the moment it opens. The option labels say enough. */}
        <SelectMenu
          ariaLabel="Filter projects by outcome"
          value={selected}
          options={options}
          className="w-44"
          onValueChange={(next) =>
            navigate(text, next === ALL_PROJECTS_VALUE ? null : (next as ProjectOutcomeFilter))
          }
        />
      </div>
    </div>
  );
}
