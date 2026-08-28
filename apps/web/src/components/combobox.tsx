"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ChevronRightIcon, SearchIcon } from "./icons";

export interface ComboboxOption {
  value: string;
  /** Matched against the typed query; also the accessible name of the row. */
  searchText: string;
  label: ReactNode;
  /** Right-aligned secondary text - a count, a role, a date. */
  meta?: ReactNode;
}

/**
 * A dropdown with a search box, for lists too long to scan - the app's
 * `SelectMenu` (Radix Select) can't filter, and Radix Select's own typeahead
 * only jumps to a prefix.
 *
 * Built on Popover rather than DropdownMenu on purpose: a menu captures
 * keystrokes for its own typeahead, so a text input inside one never receives
 * what the user types.
 */
export function Combobox({
  value,
  options,
  onValueChange,
  ariaLabel,
  placeholder = "Search",
  emptyLabel = "No matches",
  className = "w-full",
  triggerLabel,
  contentClassName = "w-[var(--radix-popover-trigger-width)]",
}: {
  value: string;
  options: ComboboxOption[];
  onValueChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  emptyLabel?: string;
  /** Trigger classes; the default fills its row, a compact trigger passes its own width. */
  className?: string;
  /** What the closed trigger shows instead of the selected option's label (a "3 / 12" position, say). */
  triggerLabel?: ReactNode;
  /** The list's width; by default it matches the trigger, which a compact trigger can't afford. */
  contentClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = options.find((option) => option.value === value);
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? options.filter((option) => option.searchText.toLowerCase().includes(needle)) : options;
  }, [options, query]);

  function choose(next: string) {
    onValueChange(next);
    setOpen(false);
  }

  // Arrow keys and Enter are handled on the input, not the list: focus stays
  // in the text field the whole time, so typing is never interrupted, and the
  // highlighted row is tracked by index instead of by DOM focus.
  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (matches.length === 0) {
        return;
      }
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const next = (activeIndex + delta + matches.length) % matches.length;
      setActiveIndex(next);
      listRef.current?.children[next]?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = matches[activeIndex];
      if (option) {
        choose(option.value);
      }
    }
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Reset per opening: a stale query would hide most of the list the
        // next time the reader opens it, with no visible cause.
        if (next) {
          setQuery("");
          setActiveIndex(0);
        }
      }}
    >
      <Popover.Trigger
        aria-label={ariaLabel}
        className={`field-input flex h-9 items-center justify-between gap-2 py-0 text-left ${className}`}
      >
        <span className="min-w-0 flex-1 truncate">{triggerLabel ?? selected?.label ?? ariaLabel}</span>
        {/* The chevron icon is drawn pointing right; a quarter turn makes it
            the down-chevron a dropdown needs, with no second icon. */}
        <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 rotate-90 text-text-faint" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className={`panel z-50 p-1 shadow-lg ${contentClassName}`}
        >
          <div className="relative p-1">
            <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint" />
            <input
              autoFocus
              type="text"
              value={query}
              placeholder={placeholder}
              aria-label={placeholder}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleKeyDown}
              className="field-input h-8 w-full pl-8 text-sm"
            />
          </div>
          <div ref={listRef} role="listbox" aria-label={ariaLabel} className="max-h-64 overflow-y-auto">
            {matches.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-text-muted">{emptyLabel}</p>
            ) : (
              matches.map((option, index) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  onClick={() => choose(option.value)}
                  onPointerMove={() => setActiveIndex(index)}
                  // The selection is carried by the row's own background, not
                  // by a trailing tick: a checkmark only appears on one row and
                  // shifts that row's meta column out of line with the rest.
                  className={`flex w-full items-center justify-between gap-3 rounded-sm px-2.5 py-1.5 text-left text-sm outline-none ${
                    option.value === value
                      ? "bg-accent-soft text-accent"
                      : index === activeIndex
                        ? "bg-surface-alt"
                        : ""
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {/* Compared against undefined, not truthiness: a meta of `0`
                      is falsy, and `{0 && <span/>}` renders a bare, unstyled
                      "0" instead of nothing. */}
                  {option.meta !== undefined && (
                    <span
                      className={`shrink-0 font-mono text-xs ${
                        option.value === value ? "text-accent" : "text-text-faint"
                      }`}
                    >
                      {option.meta}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
