"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { COMPARISON_STATUS_DOT_CLASS } from "@/lib/comparison-status";
import type { ComparisonSibling } from "@/lib/comparison-walk";
import { isEditableTarget, isPlainKey } from "@/lib/keyboard-shortcuts";
import { Combobox, type ComboboxOption } from "./combobox";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons";

function StatusDot({ status }: { status: string }) {
  return (
    <span
      aria-hidden
      // translate-y-px: centred on the line box the dot sits visibly above
      // the text's optical centre (see ViewportChip's plain form).
      className={`inline-block h-2 w-2 shrink-0 translate-y-px rounded-full ${COMPARISON_STATUS_DOT_CLASS[status] ?? "bg-text-faint"}`}
    />
  );
}

/**
 * The comparison page's walk through its run: prev/next buttons that name
 * their destination (page @ viewport, status dot), a "3 / 12" position that
 * opens the full jump list, and ← / → as keyboard shortcuts. The walk is the
 * run grid's order (`compareGridOrder`), the same list the run page lays out.
 *
 * Both edge buttons always render (disabled at the ends) so the strip keeps
 * its shape from one comparison to the next instead of losing a button.
 */
export function ComparisonNav({
  projectId,
  runId,
  siblings,
  index,
}: {
  projectId: string;
  runId: string;
  siblings: ComparisonSibling[];
  index: number;
}) {
  const router = useRouter();
  const hrefOf = (id: string) => `/projects/${projectId}/runs/${runId}/comparisons/${id}`;
  const prev = siblings[index - 1];
  const next = siblings[index + 1];
  const current = siblings[index];
  const prevHref = prev ? hrefOf(prev.id) : null;
  const nextHref = next ? hrefOf(next.id) : null;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isPlainKey(event) || isEditableTarget(event.target as HTMLElement | null)) {
        return;
      }
      if (event.key === "ArrowLeft" && prevHref) {
        event.preventDefault();
        router.push(prevHref);
      } else if (event.key === "ArrowRight" && nextHref) {
        event.preventDefault();
        router.push(nextHref);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, prevHref, nextHref]);

  const options = useMemo<ComboboxOption[]>(
    () =>
      siblings.map((stop, position) => ({
        value: stop.id,
        searchText: `${stop.pageLabel} ${stop.viewportLabel} ${stop.status}`,
        label: (
          <span className="flex items-center gap-2">
            <StatusDot status={stop.status} />
            <span className="w-6 shrink-0 text-right font-mono text-xs text-text-faint">{position + 1}</span>
            <span className="truncate">
              {stop.pageLabel} <span className="text-text-muted">@</span> {stop.viewportLabel}
            </span>
          </span>
        ),
        meta: stop.status,
      })),
    [siblings],
  );

  return (
    <nav aria-label="Comparisons of this run" className="flex flex-wrap items-center gap-2">
      <NavLink href={prevHref} stop={prev} direction="prev" />
      {current && (
        <Combobox
          value={current.id}
          options={options}
          onValueChange={(id) => router.push(hrefOf(id))}
          ariaLabel="Jump to comparison"
          placeholder="Filter comparisons"
          triggerLabel={
            <span className="font-mono text-xs">
              {index + 1} <span className="text-text-faint">/</span> {siblings.length}
            </span>
          }
          className="shrink-0 px-2.5"
          contentClassName="w-80"
        />
      )}
      <NavLink href={nextHref} stop={next} direction="next" />
    </nav>
  );
}

// A disabled edge renders a non-focusable span with the same chrome: a
// disabled <a> doesn't exist, and a button would need a no-op handler.
function NavLink({
  href,
  stop,
  direction,
}: {
  href: string | null;
  stop: ComparisonSibling | undefined;
  direction: "prev" | "next";
}) {
  const Chevron = direction === "prev" ? ChevronLeftIcon : ChevronRightIcon;
  const chevron = <Chevron className="h-3.5 w-3.5 shrink-0 translate-y-px" />;
  const className = "btn btn-quiet max-w-56 gap-2 px-3";

  if (!href || !stop) {
    return (
      <span aria-disabled className={`${className} cursor-not-allowed opacity-50`}>
        {direction === "prev" && chevron}
        <span>{direction === "prev" ? "First" : "Last"}</span>
        {direction === "next" && chevron}
      </span>
    );
  }
  return (
    <Link href={href} className={className}>
      {direction === "prev" && chevron}
      <StatusDot status={stop.status} />
      <span className="truncate">
        {stop.pageLabel} <span className="text-text-faint">@</span> {stop.viewportLabel}
      </span>
      <span className="sr-only">, {stop.status}</span>
      {direction === "next" && chevron}
    </Link>
  );
}
