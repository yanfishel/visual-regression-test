"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { CloseIcon } from "./icons";

// Thin wrapper over Radix's Dialog primitive, styled with the app's own design
// tokens - focus trap, Escape and click-outside come from Radix, the look comes
// from globals.css. Every modal in the app goes through this so the chrome
// isn't copy-pasted per dialog.
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  size = "default",
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  // "sm" fits confirmation dialogs; the default fits form dialogs.
  size?: "default" | "sm";
  children: ReactNode;
}) {
  const width = size === "sm" ? "w-[min(28rem,calc(100vw-2rem))]" : "w-[min(46rem,calc(100vw-2rem))]";
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
        {/* Anchored to the top of the viewport, not centred: a dialog whose
            height changes while open (the project dialog's tabs) would
            otherwise re-centre and jump under the pointer on every switch.
            A fixed top edge keeps the header, tab strip and footer where
            the reader left them and lets the body grow downwards. */}
        <Dialog.Content
          className={`panel fixed left-1/2 top-[6vh] z-50 flex max-h-[88vh] ${width} -translate-x-1/2 flex-col shadow-xl focus:outline-none`}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
            <div>
              <Dialog.Title className="text-lg font-bold tracking-tight">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 text-sm text-text-muted">
                  {description}
                </Dialog.Description>
              ) : (
                // Radix warns when a Content has no Description; keep the
                // association explicit rather than silencing it with aria.
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            <Dialog.Close
              aria-label="Close"
              className="-mr-2 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-text-muted hover:bg-surface-alt hover:text-text"
            >
              <CloseIcon />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
