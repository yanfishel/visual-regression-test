"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import * as RadixToast from "@radix-ui/react-toast";
import { CheckIcon, XIcon } from "./icons";

type ToastTone = "success" | "error";

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastApi {
  success(message: string): void;
  error(message: string): void;
}

const ToastContext = createContext<ToastApi | null>(null);

/**
 * Fire-and-forget notifications for autosaving controls (the /settings role
 * select and role-limits fields), which have no Save button to report back
 * through. Throws outside the provider rather than no-op'ing: a swallowed
 * toast means a save silently reports nothing.
 */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) {
    throw new Error("useToast must be used inside <ToastProvider>");
  }
  return api;
}

const TONE_CLASS: Record<ToastTone, string> = {
  success: "border-l-success text-success",
  error: "border-l-danger text-danger",
};

// Ids come from a counter, not Date.now(): two toasts fired in the same
// millisecond would collide on a timestamp key.
let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((tone: ToastTone, message: string) => {
    nextId += 1;
    setItems((prev) => [...prev, { id: nextId, tone, message }]);
  }, []);

  // Memoized so consumers that depend on the api object don't re-render on
  // every toast that comes and goes.
  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push("success", message),
      error: (message) => push("error", message),
    }),
    [push],
  );

  function dismiss(id: number) {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  return (
    <ToastContext.Provider value={api}>
      <RadixToast.Provider duration={4000} swipeDirection="right">
        {children}
        {items.map((item) => (
          <RadixToast.Root
            key={item.id}
            // Controlled-open so the item is dropped from state on close;
            // left mounted it would keep stacking invisible roots.
            open
            onOpenChange={(open) => {
              if (!open) {
                dismiss(item.id);
              }
            }}
            className="panel flex items-start gap-2.5 border-l-4 p-3 shadow-lg data-[state=closed]:opacity-0 data-[swipe=end]:translate-x-full"
          >
            <span className={`mt-px shrink-0 ${TONE_CLASS[item.tone]}`}>
              {item.tone === "success" ? <CheckIcon className="h-4 w-4" /> : <XIcon className="h-4 w-4" />}
            </span>
            <RadixToast.Description className="min-w-0 flex-1 text-sm text-text">
              {item.message}
            </RadixToast.Description>
            <RadixToast.Close aria-label="Dismiss" className="shrink-0 text-text-faint hover:text-text">
              <XIcon className="h-3.5 w-3.5" />
            </RadixToast.Close>
          </RadixToast.Root>
        ))}
        {/* Top-right, offset below the 68px sticky header rather than over
            it - the header is translucent and a toast crossing it reads as
            part of the chrome. */}
        <RadixToast.Viewport className="fixed right-4 top-[84px] z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 outline-none" />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}
