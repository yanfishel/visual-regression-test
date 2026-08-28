"use client";

import { useState } from "react";
import type { PageDraftInput } from "@vrt/shared/schemas";
import { ChevronRightIcon } from "./icons";

// One page row as edited in the project dialog. `id` is set for a page that
// already exists, absent for a row the user just added - that is what tells the
// save action to update in place instead of inserting.
export interface PageDraft {
  id?: string;
  label: string;
  path: string;
  waitSelector: string;
  maskSelectors: string;
}

export function emptyPageDraft(): PageDraft {
  return { label: "", path: "", waitSelector: "", maskSelectors: "" };
}

export function toPageInput(draft: PageDraft): PageDraftInput {
  return {
    ...(draft.id === undefined ? {} : { id: draft.id }),
    label: draft.label.trim(),
    path: draft.path.trim(),
    waitSelector: draft.waitSelector.trim() || undefined,
    maskSelectors: draft.maskSelectors
      .split(",")
      .map((selector) => selector.trim())
      .filter(Boolean),
  };
}

export function isPageDraftFilled(draft: PageDraft): boolean {
  return draft.label.trim().length > 0 && draft.path.trim().length > 0;
}

export function PageFields({
  value,
  onChange,
  idPrefix,
}: {
  value: PageDraft;
  onChange: (draft: PageDraft) => void;
  idPrefix: string;
}) {
  // Wait and mask selectors are the exception, not the rule - most pages
  // need neither - so they fold away behind "Advanced" and the row is just
  // Label | Path. A page that already uses them opens unfolded: hiding a
  // value the reader set would look like it was lost. Local state, not
  // draft state: whether the fold is open is a fact about this row on
  // screen, not about the page. The dialog's content unmounts on close
  // (Radix), so every open starts folded again.
  const [advancedOpen, setAdvancedOpen] = useState(
    () => value.waitSelector.trim() !== "" || value.maskSelectors.trim() !== "",
  );
  const advancedId = `${idPrefix}-advanced`;

  function set<K extends keyof PageDraft>(key: K, fieldValue: PageDraft[K]) {
    onChange({ ...value, [key]: fieldValue });
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Label" htmlFor={`${idPrefix}-label`}>
          <input
            id={`${idPrefix}-label`}
            value={value.label}
            onChange={(event) => set("label", event.target.value)}
            placeholder="Home"
            required
            className="field-input w-full"
          />
        </Field>
        <Field label="Path" htmlFor={`${idPrefix}-path`}>
          <input
            id={`${idPrefix}-path`}
            value={value.path}
            onChange={(event) => set("path", event.target.value)}
            placeholder="/"
            required
            className="field-input w-full"
          />
        </Field>
      </div>

      <button
        type="button"
        onClick={() => setAdvancedOpen((open) => !open)}
        aria-expanded={advancedOpen}
        aria-controls={advancedId}
        className="-ml-1 flex items-center gap-1 rounded-sm px-1 py-0.5 text-xs font-semibold text-text-muted hover:text-text"
      >
        <ChevronRightIcon className={`h-3.5 w-3.5 transition-transform ${advancedOpen ? "rotate-90" : ""}`} />
        Advanced
        <span className="font-normal text-text-faint">· wait selector, masks</span>
      </button>

      {advancedOpen && (
        <div id={advancedId} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Wait selector" htmlFor={`${idPrefix}-wait`} hint="optional">
            <input
              id={`${idPrefix}-wait`}
              value={value.waitSelector}
              onChange={(event) => set("waitSelector", event.target.value)}
              placeholder="main.loaded"
              className="field-input w-full"
            />
          </Field>
          <Field label="Mask selectors" htmlFor={`${idPrefix}-masks`} hint="comma separated">
            <input
              id={`${idPrefix}-masks`}
              value={value.maskSelectors}
              onChange={(event) => set("maskSelectors", event.target.value)}
              placeholder=".avatar, .timestamp"
              className="field-input w-full"
            />
          </Field>
        </div>
      )}
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-xs font-bold uppercase tracking-wide text-text-faint">
        {label}
        {hint ? (
          <span className="ml-1.5 font-normal normal-case tracking-normal text-text-faint">({hint})</span>
        ) : null}
      </label>
      {children}
    </div>
  );
}
