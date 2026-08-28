"use client";

import { useTransition } from "react";
import { sendTestEmailAction } from "@/app/actions";
import { ADD_EMAIL_FIRST_MESSAGE, MAIL_NOT_CONFIGURED_MESSAGE } from "@/lib/mail-copy";
import { useToast } from "./toast";

// The Schedule tab's last row: e-mail on a failed scheduled run (CLAUDE.md
// §4 "Notifications"). Disabled states spell out why in text-muted, never silently
// (CLAUDE.md §9): the instance has no SMTP, or the viewer has no address yet
// (none mode before the account menu's dialog was used).
export function NotifyToggle({
  checked,
  onChange,
  mailConfigured,
  hasEmail,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  mailConfigured: boolean;
  hasEmail: boolean;
}) {
  const toast = useToast();
  const [testing, startTesting] = useTransition();
  const disabledReason = !mailConfigured
    ? MAIL_NOT_CONFIGURED_MESSAGE
    : !hasEmail
      ? ADD_EMAIL_FIRST_MESSAGE
      : null;

  function sendTest() {
    startTesting(async () => {
      const result = await sendTestEmailAction();
      if (result.ok) toast.success("Test e-mail sent.");
      else toast.error(result.error);
    });
  }

  return (
    <section className="space-y-2 border-t border-border pt-5">
      <h3 className="text-xs font-bold uppercase tracking-wide text-text-faint">Notifications</h3>
      <label className="flex items-start gap-2.5">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabledReason !== null}
          // The reason the checkbox is dead is a sibling paragraph, so tie it
          // to the input: a screen reader must not announce only "checkbox,
          // disabled" (same pattern as email-address-dialog.tsx's test
          // button). Only while disabled - the same paragraph holds the test
          // button otherwise, whose label describes nothing about the box.
          aria-describedby={disabledReason ? "notify-toggle-hint" : undefined}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-accent disabled:opacity-50"
        />
        <span className="min-w-0">
          <span className="block text-sm font-semibold">E-mail me when a scheduled run fails</span>
          <span className="block text-xs text-text-muted">
            Only scheduled runs; one e-mail per failure until the run is approved or passes again.
          </span>
        </span>
      </label>
      {/* Either the reason the checkbox above is dead, or - when it is live -
          the way to prove the wiring works before waiting for a real run.
          No global text-link button class exists, so the link look is
          spelled out here. */}
      <p id="notify-toggle-hint" className="flex flex-wrap items-center gap-x-3 text-xs text-text-muted">
        {disabledReason ?? (
          <button
            type="button"
            onClick={sendTest}
            disabled={testing}
            className="font-semibold text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            {testing ? "Sending…" : "Send test e-mail"}
          </button>
        )}
      </p>
    </section>
  );
}
