"use client";

import { usePathname, useRouter } from "next/navigation";
import { RUN_FILTER_QUERY_PARAM, RUN_FROM_QUERY_PARAM, RUN_TO_QUERY_PARAM } from "@/lib/query-params";
import type { DateRange } from "@/lib/run-date-range";
import { RUN_FILTER_DOT_CLASS, RUN_FILTER_LABEL, type RunFilterOption } from "@/lib/run-filter-display";
import { RUN_FILTERS, type RunOutcomeFilter } from "@/lib/run-filters";
import { DateRangeFilter } from "./date-range-filter";
import { SelectMenu, type SelectMenuOption } from "./select-menu";

/** "No filter" needs a value of its own: Radix reserves `""` for "no value". */
const ALL_RUNS_VALUE: RunFilterOption = "all";

function FilterLabel({ filter }: { filter: RunFilterOption }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 shrink-0 rounded-full ${RUN_FILTER_DOT_CLASS[filter]}`} />
      {RUN_FILTER_LABEL[filter]}
    </span>
  );
}

// Count + date range + outcome filter for the project page's run table - the
// /projects toolbar minus the search box. The list state lives in the URL,
// so the server page stays the one place that filters and paginates; this
// only rewrites the query string, and any change starts from page one (the
// page param is simply not carried).
export function RunsToolbar({
  filter,
  range,
  total,
}: {
  filter: RunOutcomeFilter | null;
  range: DateRange | null;
  total: number;
}) {
  const router = useRouter();
  const pathname = usePathname();

  function navigate(nextFilter: RunOutcomeFilter | null, nextRange: DateRange | null) {
    const params = new URLSearchParams();
    if (nextFilter) {
      params.set(RUN_FILTER_QUERY_PARAM, nextFilter);
    }
    if (nextRange?.from) {
      params.set(RUN_FROM_QUERY_PARAM, nextRange.from);
    }
    if (nextRange?.to) {
      params.set(RUN_TO_QUERY_PARAM, nextRange.to);
    }
    const suffix = params.toString();
    router.replace(suffix ? `${pathname}?${suffix}` : pathname, { scroll: false });
  }

  const selected: RunFilterOption = filter ?? ALL_RUNS_VALUE;
  const options: SelectMenuOption[] = [ALL_RUNS_VALUE, ...RUN_FILTERS].map((value) => ({
    value,
    label: <FilterLabel filter={value} />,
  }));

  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="font-mono text-xs text-text-faint">
        {total} {total === 1 ? "run" : "runs"}
      </p>
      <DateRangeFilter range={range} onChange={(next) => navigate(filter, next)} />
      <SelectMenu
        ariaLabel="Filter runs by outcome"
        value={selected}
        options={options}
        className="w-36"
        onValueChange={(next) => navigate(next === ALL_RUNS_VALUE ? null : (next as RunOutcomeFilter), range)}
      />
    </div>
  );
}
