"use client";

import { useLiveQueue } from "./live-provider";
import * as Tooltip from "@radix-ui/react-tooltip";

// Status is never color alone: the dot is always accompanied by a word. The
// dot wears the same soft-token halo as the sidebar's WorkerStatus dot
// (`status-dot` in globals.css), so the two read as one indicator.
export function WorkerIndicator() {
  const { queue, connected } = useLiveQueue();

  const state = !connected
    ? { dot: "bg-text-faint ring-surface-alt", label: "Reconnecting", tooltip: "Worker reconnecting" }
    : queue.workersOnline === 0
      ? { dot: "bg-danger ring-danger-soft", label: "Offline", tooltip: "Worker offline" }
      : {
          dot: "bg-success ring-success-soft",
          label: `Online · ${queue.active + queue.waiting}`,
          tooltip: `Worker online. Active runs: ${queue.active}, waiting: ${queue.waiting}`,
        };

  // h-[30px] matches the theme toggle so the header's control row reads as
  // one line - keep the three right-side controls the same height.
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <span className="hidden h-[30px] items-center gap-2 rounded-full border border-border px-2.5 text-xs text-text-muted sm:inline-flex cursor-pointer">
          <span className={`status-dot shrink-0 ${state.dot}`} />
          {state.label}
        </span>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="bottom"
          sideOffset={6}
          className="z-50 max-w-xs select-none rounded-md bg-text px-2.5 py-1.5 text-xs font-medium text-bg shadow-md"
        >
          {state.tooltip}
          <Tooltip.Arrow className="fill-text" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
