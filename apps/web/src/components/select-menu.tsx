"use client";

import type { ReactNode } from "react";
import * as Select from "@radix-ui/react-select";
import { CheckIcon, ChevronRightIcon } from "./icons";

export interface SelectMenuOption {
  value: string;
  /** Rendered in both the trigger and the list, so it must be inline content. */
  label: ReactNode;
}

/**
 * The app's dropdown: a Radix Select styled as a `.field-input`, used wherever
 * a native `<select>` won't do because the options carry markup - a colour
 * badge, an icon - which `<option>` cannot hold.
 *
 * Values are plain strings. A caller whose own value type includes `null`
 * (an "all" entry) maps it to a sentinel of its own: Radix reserves `""` for
 * "no value selected", so an empty string can't stand for a real choice.
 */
export function SelectMenu({
  value,
  options,
  onValueChange,
  ariaLabel,
  disabled = false,
  className = "",
}: {
  value: string;
  options: SelectMenuOption[];
  onValueChange: (value: string) => void;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Select.Root value={value} disabled={disabled} onValueChange={onValueChange}>
      <Select.Trigger
        aria-label={ariaLabel}
        className={`field-input flex h-9 items-center justify-between gap-2 py-0 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      >
        <Select.Value />
        <Select.Icon>
          {/* The chevron icon is drawn pointing right; a quarter turn makes
              it the down-chevron a select needs, with no second icon. */}
          <ChevronRightIcon className="h-3.5 w-3.5 rotate-90 text-text-faint" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={4}
          className="panel z-50 min-w-[var(--radix-select-trigger-width)] p-1 shadow-lg"
        >
          <Select.Viewport>
            {options.map((option) => (
              <Select.Item
                key={option.value}
                value={option.value}
                className="flex cursor-pointer select-none items-center justify-between gap-3 rounded-sm px-2.5 py-1.5 font-mono text-sm text-text outline-none data-[highlighted]:bg-surface-alt"
              >
                <Select.ItemText>{option.label}</Select.ItemText>
                <Select.ItemIndicator>
                  <CheckIcon className="h-3.5 w-3.5 text-accent" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
