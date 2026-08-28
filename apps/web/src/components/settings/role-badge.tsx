import * as Tooltip from "@radix-ui/react-tooltip";
import type { UserRole } from "@vrt/shared/constants";
import { ROLE_DOT_CLASS, ROLE_LABEL, ROLE_TEXT_CLASS } from "@/lib/role-display";

/**
 * The role marker: a coloured dot, optionally with its name beside it.
 * Colour is never the only carrier of meaning (CLAUDE.md section 9) -
 * the label-less form keeps the name in `sr-only` text and a tooltip.
 */
export function RoleBadge({ role, withLabel = false }: { role: UserRole; withLabel?: boolean }) {
  const dot = <span className={`h-2 w-2 shrink-0 rounded-full ${ROLE_DOT_CLASS[role]}`} />;

  if (withLabel) {
    return (
      <span className="inline-flex items-center gap-1.5">
        {dot}
        <span className={ROLE_TEXT_CLASS[role]}>{ROLE_LABEL[role]}</span>
      </span>
    );
  }

  return (
    // Radix tooltip, never the native `title` (project rule); the provider
    // lives in the root layout.
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <span className="inline-flex items-center">
          {dot}
          <span className="sr-only">{ROLE_LABEL[role]}</span>
        </span>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="top"
          sideOffset={6}
          className="z-50 select-none rounded-md bg-text px-2 py-1 text-xs font-medium text-bg shadow-md"
        >
          {ROLE_LABEL[role]}
          <Tooltip.Arrow className="fill-text" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
