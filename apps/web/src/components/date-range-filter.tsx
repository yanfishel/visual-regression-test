"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { DayPicker, type DateRange as PickerRange } from "react-day-picker";
import "react-day-picker/style.css";
import type { DateRange } from "@/lib/run-date-range";
import { CalendarIcon } from "./icons";

const LABEL_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const LABEL_FORMAT_WITH_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

// The picker hands out Dates at the browser's local midnight; the URL and
// the server speak YYYY-MM-DD calendar days. Both conversions stay in the
// browser's own calendar (never toISOString - that would shift the day for
// anyone east of UTC).
function toKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function fromKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year!, month! - 1, day);
}

function describeRange(range: DateRange | null): string {
  if (!range) {
    return "Any date";
  }
  const thisYear = new Date().getFullYear();
  const format = (key: string) => {
    const date = fromKey(key);
    return (date.getFullYear() === thisYear ? LABEL_FORMAT : LABEL_FORMAT_WITH_YEAR).format(date);
  };
  if (range.from && range.to) {
    return range.from === range.to ? format(range.from) : `${format(range.from)} – ${format(range.to)}`;
  }
  return range.from ? `From ${format(range.from)}` : `Until ${format(range.to!)}`;
}

/**
 * The run table's date filter: a `field-input`-styled trigger naming the
 * active range, opening a Radix Popover with `react-day-picker` in range
 * mode. Radix has no calendar primitive of its own - the popover is the
 * Radix part, the calendar is react-day-picker styled through its CSS
 * variables in globals.css. Every click on a day applies at once (first
 * click "from", second "to"; the popover stays open), so the list narrows
 * as the range takes shape; Clear drops it.
 */
export function DateRangeFilter({
  range,
  onChange,
}: {
  range: DateRange | null;
  onChange: (range: DateRange | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected: PickerRange | undefined = range
    ? { from: range.from ? fromKey(range.from) : undefined, to: range.to ? fromKey(range.to) : undefined }
    : undefined;

  function handleSelect(next: PickerRange | undefined) {
    if (!next?.from) {
      onChange(null);
      return;
    }
    onChange({ from: toKey(next.from), to: next.to ? toKey(next.to) : null });
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label="Filter runs by date"
        className={`field-input flex h-9 items-center gap-2 py-0 ${range ? "" : "text-text-muted"}`}
      >
        <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-text-faint" />
        {describeRange(range)}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={4}
          collisionPadding={12}
          className="date-range-picker panel z-50 p-3 shadow-lg"
        >
          <DayPicker
            mode="range"
            selected={selected}
            onSelect={handleSelect}
            defaultMonth={selected?.from}
            // A run can't be in the future; greying tomorrow onward says so
            // without a note.
            disabled={{ after: new Date() }}
            weekStartsOn={1}
          />
          <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
            <span className="font-mono text-xs text-text-faint">{describeRange(range)}</span>
            <button
              type="button"
              className="btn btn-quiet h-8 px-3 py-0 text-xs disabled:opacity-50"
              disabled={!range}
              onClick={() => onChange(null)}
            >
              Clear
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
