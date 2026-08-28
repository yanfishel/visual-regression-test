"use client";

import type { UserRole } from "@vrt/shared/constants";
import { USER_ROLES } from "@vrt/shared/constants";
import { SelectMenu, type SelectMenuOption } from "../select-menu";
import { RoleBadge } from "./role-badge";

/**
 * `null` (the filter's "All roles" entry) travels as a sentinel of its own:
 * Radix Select reserves the empty string for "no value selected".
 */
const ALL_ROLES_VALUE = "__all__";

/**
 * Shared role dropdown for both /settings controls - the per-row picker and
 * the toolbar filter - over the app's `SelectMenu`. It has to be a Radix
 * select rather than a native one because every option carries its colour
 * badge, and `<option>` can't hold markup.
 */
export function RoleSelect({
  value,
  onValueChange,
  disabled = false,
  ariaLabel,
  includeAllOption = false,
  className = "",
}: {
  value: UserRole | null;
  onValueChange: (value: UserRole | null) => void;
  disabled?: boolean;
  ariaLabel: string;
  includeAllOption?: boolean;
  className?: string;
}) {
  const options: SelectMenuOption[] = [
    ...(includeAllOption ? [{ value: ALL_ROLES_VALUE, label: "All roles" }] : []),
    ...USER_ROLES.map((role) => ({ value: role, label: <RoleBadge role={role} withLabel /> })),
  ];

  return (
    <SelectMenu
      ariaLabel={ariaLabel}
      value={value ?? ALL_ROLES_VALUE}
      options={options}
      disabled={disabled}
      className={className}
      onValueChange={(next) => onValueChange(next === ALL_ROLES_VALUE ? null : (next as UserRole))}
    />
  );
}
