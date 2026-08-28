import type { ComponentType } from "react";
import type { RunTrigger as RunTriggerKind } from "@vrt/shared/constants";
import { RUN_TRIGGER_LABEL, RUN_TRIGGER_TEXT_CLASS } from "@/lib/run-trigger-display";
import { BoltIcon, ClockIcon, PointerClickIcon } from "./icons";

const ICONS: Record<RunTriggerKind, ComponentType<{ className?: string }>> = {
  manual: PointerClickIcon,
  schedule: ClockIcon,
  webhook: BoltIcon,
};

// How a run was started - icon + word in the trigger's own hue
// (lib/run-trigger-display.ts), so manual and automatic runs tell apart at
// a glance in a list. Colour is never the only carrier: the icon shape and
// the word say the same thing.
export function RunTrigger({ trigger, className }: { trigger: RunTriggerKind; className?: string }) {
  const Icon = ICONS[trigger];
  return (
    <span
      className={["inline-flex items-center gap-1.5 font-medium", RUN_TRIGGER_TEXT_CLASS[trigger], className]
        .filter(Boolean)
        .join(" ")}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {RUN_TRIGGER_LABEL[trigger]}
    </span>
  );
}
