"use client";

import { useEffect, useState, type ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Tooltip from "@radix-ui/react-tooltip";
import { CheckIcon, MonitorIcon, MoonIcon, SunIcon } from "./icons";

// Mirrored by THEME_INIT_SCRIPT in app/layout.tsx, which applies the stored
// preference before hydration - keep the key and the value set in sync.
const THEME_STORAGE_KEY = "vrt-theme";
const DARK_SCHEME_QUERY = "(prefers-color-scheme: dark)";

type ThemePreference = "system" | "light" | "dark";

const OPTIONS: Record<ThemePreference, { label: string; icon: ReactNode }> = {
  system: { label: "System", icon: <MonitorIcon className="h-4 w-4" /> },
  light: { label: "Light", icon: <SunIcon /> },
  dark: { label: "Dark", icon: <MoonIcon /> },
};
const OPTION_ORDER: ThemePreference[] = ["system", "light", "dark"];

function isThemePreference(value: string): value is ThemePreference {
  return value in OPTIONS;
}

// Only an explicit override is stored; a missing key means "follow the OS",
// so a fresh browser starts on the system theme without writing anything.
function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored !== null && isThemePreference(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

function writePreference(preference: ThemePreference) {
  try {
    if (preference === "system") {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      localStorage.setItem(THEME_STORAGE_KEY, preference);
    }
  } catch {
    // Storage may be unavailable (private mode, quota); the theme still
    // applies for this page view.
  }
}

function applyPreference(preference: ThemePreference) {
  const dark = preference === "system" ? window.matchMedia(DARK_SCHEME_QUERY).matches : preference === "dark";
  document.documentElement.classList.toggle("dark", dark);
}

const ITEM_CLASS =
  "flex cursor-pointer select-none items-center gap-2.5 rounded-sm py-1.5 pl-3 pr-8 text-sm text-text outline-none data-[highlighted]:bg-surface-alt";

/**
 * Header theme picker: a dropdown of System / Light / Dark. The trigger shows
 * the icon of the *preference*, not of the theme currently painted, so
 * "System" reads as its own state rather than as whichever of light/dark the
 * OS happens to be on.
 */
export function ThemeMenu() {
  // `null` until mounted: the server can't know the stored preference, so
  // the trigger renders the default (system) icon first and swaps after
  // hydration - the same beat the old two-state toggle had.
  const [preference, setPreference] = useState<ThemePreference | null>(null);

  useEffect(() => {
    setPreference(readPreference());
  }, []);

  // While following the OS, track it live instead of waiting for a reload.
  useEffect(() => {
    if (preference !== "system") return;
    const media = window.matchMedia(DARK_SCHEME_QUERY);
    const onChange = () => applyPreference("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);

  function select(value: string) {
    if (!isThemePreference(value)) return;
    writePreference(value);
    applyPreference(value);
    setPreference(value);
  }

  const value = preference ?? "system";
  const current = OPTIONS[value];

  return (
    <DropdownMenu.Root>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              aria-label={`Theme: ${current.label}`}
              className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-border bg-surface-alt text-accent hover:border-text-faint"
            >
              {current.icon}
            </button>
          </DropdownMenu.Trigger>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="bottom"
            sideOffset={6}
            className="z-50 select-none rounded-md bg-text px-2.5 py-1.5 text-xs font-medium text-bg shadow-md"
          >
            Theme: {current.label}
            <Tooltip.Arrow className="fill-text" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={10} className="panel z-30 min-w-40 p-1.5 shadow-lg">
          <DropdownMenu.RadioGroup value={value} onValueChange={select}>
            {OPTION_ORDER.map((option) => (
              <DropdownMenu.RadioItem key={option} value={option} className={`${ITEM_CLASS} relative`}>
                <span className="flex w-4 items-center justify-center text-text-muted">
                  {OPTIONS[option].icon}
                </span>
                {OPTIONS[option].label}
                <DropdownMenu.ItemIndicator className="absolute right-2.5">
                  <CheckIcon className="h-3.5 w-3.5 text-accent" />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
