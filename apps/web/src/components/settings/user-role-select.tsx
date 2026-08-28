"use client";

import { useEffect, useState, useTransition } from "react";
import type { UserRole } from "@vrt/shared/constants";
import { ROLE_LABEL } from "@/lib/role-display";
import { updateUserRoleAction } from "@/app/(app)/settings/actions";
import { SpinnerIcon } from "../icons";
import { useToast } from "../toast";
import { RoleSelect } from "./role-select";

/**
 * Autosaving role picker: changing the value calls the action straight away,
 * so there is no Save button. The shown value is optimistic and reverts to
 * the server's on failure, which is why it needs local state at all - the
 * `role` prop only catches up once `revalidatePath` re-renders the page.
 */
export function UserRoleSelect({
  userId,
  email,
  role,
  isSelf,
  isLocalDefault,
}: {
  userId: string;
  email: string;
  role: UserRole;
  isSelf: boolean;
  // The none-mode default user (clerk_id NULL) - see updateUserRoleAction's
  // matching guard. Locked the same way as isSelf: nobody signs in as this
  // row in clerk mode, so its role has nothing to change it for.
  isLocalDefault: boolean;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState<UserRole>(role);
  const locked = isSelf || isLocalDefault;

  // Re-sync when the server sends a different role than the one being shown:
  // covers both the revalidation after our own save and a change made in
  // another tab. Skipped while a save is in flight so the optimistic value
  // isn't overwritten by the pre-save render.
  useEffect(() => {
    if (!pending) {
      setValue(role);
    }
  }, [role, pending]);

  function handleChange(next: UserRole) {
    const previous = value;
    setValue(next);
    startTransition(async () => {
      const result = await updateUserRoleAction({ userId, role: next });
      if (result.ok) {
        toast.success(`${email} is now ${ROLE_LABEL[next]}.`);
      } else {
        setValue(previous);
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {/* Fixed-width slot rather than a conditionally rendered icon, so the
          control doesn't shift while a save is in flight. It sits before the
          select because the whole cell is right-aligned. */}
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-text-faint">
        {pending && <SpinnerIcon className="h-4 w-4 animate-spin" />}
      </span>
      <RoleSelect
        ariaLabel={`Role for ${email}`}
        value={value}
        disabled={locked || pending}
        onValueChange={(next) => {
          if (next) {
            handleChange(next);
          }
        }}
        className="w-28"
      />
    </div>
  );
}
