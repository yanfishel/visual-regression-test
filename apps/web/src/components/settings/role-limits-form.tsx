"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { RoleLimitsRow } from "@vrt/db";
import { saveRoleLimitsAction } from "@/app/(app)/settings/actions";
import { SpinnerIcon } from "../icons";
import { useToast } from "../toast";

type LimitedRole = "user" | "pro";

interface LimitsRowState {
  role: LimitedRole;
  maxProjects: number;
  maxPagesPerProject: number;
  maxAutomatedRunsPerDay: number;
}

const LIMITED_ROLES: LimitedRole[] = ["user", "pro"];
const ROLE_LABELS: Record<LimitedRole, string> = { user: "User", pro: "Pro" };

// Long enough that editing several fields in a row lands as one save (and so
// one toast) instead of a queue of them, short enough to feel automatic.
const SAVE_DEBOUNCE_MS = 800;

function toRowState(role: LimitedRole, limits: RoleLimitsRow[]): LimitsRowState {
  const existing = limits.find((row) => row.role === role);
  return {
    role,
    maxProjects: existing?.maxProjects ?? 0,
    maxPagesPerProject: existing?.maxPagesPerProject ?? 1,
    maxAutomatedRunsPerDay: existing?.maxAutomatedRunsPerDay ?? 0,
  };
}

function toRowStates(limits: RoleLimitsRow[]): LimitsRowState[] {
  return LIMITED_ROLES.map((role) => toRowState(role, limits));
}

/**
 * Autosaving limits table: every field change schedules a debounced save of
 * both rows (the action upserts them together), so there is no Save button.
 * A failed save rolls the whole table back to what the server last sent.
 */
export function RoleLimitsForm({ limits }: { limits: RoleLimitsRow[] }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<LimitsRowState[]>(() => toRowStates(limits));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, []);

  function scheduleSave(next: LimitsRowState[]) {
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => {
      startTransition(async () => {
        const result = await saveRoleLimitsAction({ limits: next });
        if (result.ok) {
          toast.success("Role limits saved.");
        } else {
          // Back to the last values the server confirmed - the props are
          // still the pre-edit ones, since a failed save never revalidated.
          setRows(toRowStates(limits));
          toast.error(result.error);
        }
      });
    }, SAVE_DEBOUNCE_MS);
  }

  // Number("") is 0 and intermediate input states parse to NaN (which
  // JSON.stringify would turn into null and zod would reject with a cryptic
  // message) - clamp to an integer no lower than the field's minimum and
  // keep the previous value while the input isn't a number at all.
  function updateField(
    role: LimitedRole,
    field: keyof Omit<LimitsRowState, "role">,
    raw: string,
    min: number,
  ) {
    const parsed = Number(raw);
    // Derived from the rendered `rows`, not inside a setState updater: the
    // updater must stay pure (StrictMode runs it twice in dev), and every
    // change event re-renders, so the closure is never stale.
    const next = rows.map((row) =>
      row.role === role
        ? { ...row, [field]: Number.isFinite(parsed) ? Math.max(min, Math.trunc(parsed)) : row[field] }
        : row,
    );
    setRows(next);
    scheduleSave(next);
  }

  return (
    <div className="mb-4">
      {/* Fixed-height slot so the table doesn't shift when a save starts. */}
      <p className="flex h-4 items-center justify-center gap-1.5 font-mono text-xs text-text-faint mb-3 mt-[-8px]">
        {pending && (
          <>
            <SpinnerIcon className="h-3.5 w-3.5 animate-spin" />
            Saving…
          </>
        )}
      </p>
      {/* Four number inputs can't fold into anything narrower, so this table
          scrolls itself rather than widening the page. The negative margins
          undo the panel's padding so the scroll runs edge to edge instead of
          stopping short of it. */}
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-full min-w-[30rem] border-collapse text-left text-sm">
          <thead>
            <tr className="text-xs font-bold uppercase tracking-wide text-text-faint">
              <th className="pb-1 pr-4 font-bold">Role</th>
              <th className="pb-1 pr-4 font-bold">Max projects</th>
              <th className="pb-1 pr-4 font-bold">Max pages/project</th>
              <th className="pb-1 font-bold">Max automated runs/day per project</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.role} className="border-t border-border">
                <td className="py-2 pr-4 font-medium">{ROLE_LABELS[row.role]}</td>
                <td className="py-2 pr-4">
                  <input
                    type="number"
                    min={0}
                    aria-label={`Max projects for ${ROLE_LABELS[row.role]}`}
                    className="field-input w-24"
                    value={row.maxProjects}
                    onChange={(event) => updateField(row.role, "maxProjects", event.target.value, 0)}
                  />
                </td>
                <td className="py-2 pr-4">
                  <input
                    type="number"
                    min={1}
                    aria-label={`Max pages per project for ${ROLE_LABELS[row.role]}`}
                    className="field-input w-24"
                    value={row.maxPagesPerProject}
                    onChange={(event) => updateField(row.role, "maxPagesPerProject", event.target.value, 1)}
                  />
                </td>
                <td className="py-2">
                  <input
                    type="number"
                    min={0}
                    aria-label={`Max automated runs per day per project for ${ROLE_LABELS[row.role]}`}
                    className="field-input w-24"
                    value={row.maxAutomatedRunsPerDay}
                    onChange={(event) =>
                      updateField(row.role, "maxAutomatedRunsPerDay", event.target.value, 0)
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
