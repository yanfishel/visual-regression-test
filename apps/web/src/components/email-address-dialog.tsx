"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendTestEmailAction, updateEmailAction } from "@/app/actions";
import { MAIL_NOT_CONFIGURED_MESSAGE } from "@/lib/mail-copy";
import { Field } from "./page-fields";
import { Modal } from "./modal";
import { useToast } from "./toast";

// None mode's one account setting: where notification e-mails go. Writes
// users.email of the default row (CLAUDE.md §4 "Notifications"); the header's menu
// re-renders through router.refresh() so the new address shows at once.
export function EmailAddressDialog({
  open,
  onOpenChange,
  email,
  mailConfigured,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Current address, or null when only the placeholder is stored. */
  email: string | null;
  mailConfigured: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState(email ?? "");
  const [saving, startSaving] = useTransition();
  const [testing, startTesting] = useTransition();

  // Reopening starts from what the server has, like the project dialog.
  useEffect(() => {
    if (open) setValue(email ?? "");
  }, [open, email]);

  function save() {
    startSaving(async () => {
      const result = await updateEmailAction({ email: value });
      if (result.ok) {
        toast.success("E-mail address saved.");
        router.refresh();
        onOpenChange(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  function sendTest() {
    startTesting(async () => {
      const result = await sendTestEmailAction();
      if (result.ok) toast.success(`Test e-mail sent to ${email}.`);
      else toast.error(result.error);
    });
  }

  const testDisabledReason = !mailConfigured
    ? MAIL_NOT_CONFIGURED_MESSAGE
    : email === null
      ? "Save an address first."
      : null;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="E-mail address"
      description="Where notifications about your projects' scheduled runs are sent."
      size="sm"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
        className="flex flex-col"
      >
        <div className="px-6 py-5">
          <Field label="E-mail" htmlFor="account-email">
            <input
              id="account-email"
              type="email"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="you@example.com"
              autoFocus
              className="field-input w-full"
            />
          </Field>
          {/* Same permanently-mounted aria-live hint pattern as the project
              dialog footer: the text swaps, the element stays. */}
          <p id="test-email-hint" aria-live="polite" className="mt-3 min-h-5 text-sm text-text-muted">
            {testDisabledReason ??
              "Send yourself a test message to check the address and the instance's SMTP setup."}
          </p>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={sendTest}
            disabled={testDisabledReason !== null || testing}
            // A disabled button isn't focusable, so nothing reads the
            // description on the way to it - but the association still lets a
            // screen reader explain the button when the footer is browsed.
            aria-describedby="test-email-hint"
            className="btn btn-quiet mr-auto shrink-0"
          >
            {testing ? "Sending…" : "Send test e-mail"}
          </button>
          <button type="button" onClick={() => onOpenChange(false)} className="btn btn-quiet shrink-0">
            Cancel
          </button>
          <button type="submit" disabled={saving || value.trim() === ""} className="btn btn-primary shrink-0">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
