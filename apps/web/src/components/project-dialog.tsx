"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import * as Tooltip from "@radix-ui/react-tooltip";
import { usePathname, useRouter } from "next/navigation";
import type { ViewportPresetId } from "@vrt/shared/constants";
import { createProjectAction } from "@/app/actions";
import { saveProjectAction } from "@/app/(app)/projects/[projectId]/actions";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import {
  describeMissingProjectRequirements,
  incompleteProjectSections,
  type ProjectDraftSummary,
} from "@/lib/project-dialog-requirements";
import { PencilIcon, PlusIcon, TrashIcon } from "./icons";
import { Modal } from "./modal";
import { NotifyToggle } from "./notify-toggle";
import {
  emptyPageDraft,
  Field,
  isPageDraftFilled,
  PageFields,
  toPageInput,
  type PageDraft,
} from "./page-fields";
import { OFF_SCHEDULE, ScheduleFields, type ScheduleDraft } from "./schedule-fields";
import { ViewportPicker } from "./viewport-picker";

type DialogTab = "general" | "pages" | "schedule";

// One tab trigger: the section's name, a short summary of what it holds
// ("· 2", "· On") so the reader knows the state of every section without
// visiting it, and a warning dot when a save requirement in that section is
// still unmet - the footer spells the requirement out, the dot says where.
// Colour is not the only carrier: the dot has sr-only text.
function DialogTab({
  value,
  label,
  summary,
  incomplete = false,
}: {
  value: DialogTab;
  label: string;
  summary?: ReactNode;
  incomplete?: boolean;
}) {
  return (
    <Tabs.Trigger
      value={value}
      className="-mb-px flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2.5 text-sm font-semibold text-text-muted hover:text-text data-[state=active]:border-accent data-[state=active]:text-accent sm:px-4"
    >
      {label}
      {summary !== undefined && <span className="font-normal text-text-faint">· {summary}</span>}
      {incomplete && (
        <>
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-warning" />
          <span className="sr-only">(incomplete)</span>
        </>
      )}
    </Tabs.Trigger>
  );
}

export interface ProjectDialogData {
  id: string;
  name: string;
  baseUrl: string;
  presetIds: ViewportPresetId[];
  pages: PageDraft[];
  schedule: ScheduleDraft;
  notifyOnFailure: boolean;
}

// One dialog for both creating and editing: with `project` it edits that
// project (and is the only way to change its pages and viewports), without it
// it creates a new one. Opened by its own button, or - when creating - by the
// header's /?new=1 link, which is why `initialOpen` exists.
export function ProjectDialog({
  project,
  initialOpen = false,
  trigger = "button",
  timeZone,
  automatedRunLimit,
  automatedRunsUsed,
  mailConfigured,
  hasEmail,
}: {
  project?: ProjectDialogData;
  initialOpen?: boolean;
  // "icon" is the project card's compact toolbar variant; the default is the
  // labelled button the project page and the list header use.
  trigger?: "button" | "icon";
  /** Viewer's IANA zone, resolved on the server from the vrt-tz cookie. */
  timeZone: string;
  automatedRunLimit: number | null;
  automatedRunsUsed: number;
  /** Whether this instance can send e-mail - both this and `hasEmail` decide
   *  if the notify toggle is enabled (never silently dead: notify-toggle.tsx
   *  names the missing half). */
  mailConfigured: boolean;
  /** Whether the viewer has an address of their own yet (lib/auth/email.ts). */
  hasEmail: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const isEdit = project !== undefined;

  const [open, setOpen] = useState(initialOpen);
  const [name, setName] = useState(project?.name ?? "");
  const [baseUrl, setBaseUrl] = useState(project?.baseUrl ?? "");
  const [presetIds, setPresetIds] = useState<ViewportPresetId[]>(project?.presetIds ?? ["desktop"]);
  const [pageDrafts, setPageDrafts] = useState<PageDraft[]>(
    project && project.pages.length > 0 ? project.pages : [emptyPageDraft()],
  );
  const [schedule, setSchedule] = useState<ScheduleDraft>(project?.schedule ?? OFF_SCHEDULE);
  const [notifyOnFailure, setNotifyOnFailure] = useState(project?.notifyOnFailure ?? false);
  // The dialog's three sections are tabs (ui.md "Project setup dialogs"):
  // one scrolling column buried the schedule under the page list. Every
  // open starts on General.
  const [tab, setTab] = useState<DialogTab>("general");

  const [state, formAction, isPending] = useActionState(
    isEdit ? saveProjectAction : createProjectAction,
    EMPTY_FORM_STATE,
  );
  const wasPending = useRef(false);
  // `useActionState` keeps its last result for as long as this component is
  // mounted, and the component outlives the dialog - so a rejected save was
  // still sitting in the footer the next time the dialog opened. Only an
  // error this open session produced is shown.
  const [showError, setShowError] = useState(false);

  // Creating redirects, so only the edit action returns here: a pending cycle
  // that ended without an error means the save went through.
  useEffect(() => {
    if (wasPending.current && !isPending) {
      if (state.error === null) {
        setOpen(false);
      } else {
        setShowError(true);
      }
    }
    wasPending.current = isPending;
  }, [isPending, state]);

  // A new page row lands at the bottom of the dialog's scrolling body, below
  // the fold on every project that already has a page or two - so adding one
  // looked like nothing happened. The row that was just added is scrolled to
  // and takes the caret; `null` once that has been done, so this only ever
  // fires for a fresh row and never fights the reader's own scrolling.
  const [addedPageIndex, setAddedPageIndex] = useState<number | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (addedPageIndex === null) {
      return;
    }
    const body = bodyRef.current;
    // Focus without its own scroll, then take the body to the bottom: a new
    // row is always appended, so that lands on the whole card *and* the "Add
    // another page" button under it, where scrolling the input into view
    // would only guarantee the input itself.
    body?.querySelector<HTMLInputElement>(`#page-${addedPageIndex}-label`)?.focus({ preventScroll: true });
    body?.scrollTo({ top: body.scrollHeight });
    setAddedPageIndex(null);
  }, [addedPageIndex]);

  const filledPages = pageDrafts.filter(isPageDraftFilled);
  // Same four inputs the old single boolean folded together, kept as one
  // summary object so both the gate and the footer's explanation read off
  // it - a rewrite of one can no longer silently drift from the other.
  const requirementsSummary: ProjectDraftSummary = {
    name,
    baseUrl,
    presetCount: presetIds.length,
    filledPageCount: filledPages.length,
  };
  const missingRequirements = describeMissingProjectRequirements(requirementsSummary);
  const incompleteSections = incompleteProjectSections(requirementsSummary);
  const canSubmit = missingRequirements === null;

  const payload = JSON.stringify({
    ...(project ? { projectId: project.id } : {}),
    name: name.trim(),
    baseUrl: baseUrl.trim(),
    viewportPresetIds: presetIds,
    pages: filledPages.map(toPageInput),
    schedule: schedule.enabled
      ? { runsPerDay: schedule.runsPerDay, window: schedule.window, timeZone }
      : null,
    notifyOnFailure,
  });

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setShowError(false);
      setTab("general");
    }
    // Reopening starts from what the server currently has, so a cancelled edit
    // doesn't linger in the form.
    if (nextOpen && project) {
      setName(project.name);
      setBaseUrl(project.baseUrl);
      setPresetIds(project.presetIds);
      setPageDrafts(project.pages.length > 0 ? project.pages : [emptyPageDraft()]);
      setSchedule(project.schedule);
      setNotifyOnFailure(project.notifyOnFailure);
    }
    setOpen(nextOpen);
    // Drop ?new=1 on close so reloading or going back doesn't reopen it.
    if (!nextOpen && initialOpen) {
      router.replace(pathname, { scroll: false });
    }
  }

  function addPage() {
    setPageDrafts((drafts) => [...drafts, emptyPageDraft()]);
    setAddedPageIndex(pageDrafts.length);
  }

  function updatePage(index: number, draft: PageDraft) {
    setPageDrafts((drafts) => drafts.map((existing, i) => (i === index ? draft : existing)));
  }

  function removePage(index: number) {
    setPageDrafts((drafts) => drafts.filter((_, i) => i !== index));
  }

  return (
    <>
      {trigger === "icon" ? (
        // Radix tooltip (project rule - never the native `title`), fed by
        // the provider in the root layout.
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <button
              type="button"
              onClick={() => handleOpenChange(true)}
              aria-label={isEdit ? "Edit project" : "New project"}
              className="btn-icon hover:bg-surface hover:text-text"
            >
              {isEdit ? <PencilIcon /> : <PlusIcon />}
            </button>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              side="bottom"
              sideOffset={6}
              className="z-50 select-none rounded-md bg-text px-2 py-1 text-xs font-medium text-bg shadow-md"
            >
              {isEdit ? "Edit project" : "New project"}
              <Tooltip.Arrow className="fill-text" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      ) : (
        <button
          type="button"
          onClick={() => handleOpenChange(true)}
          className={isEdit ? "btn btn-quiet px-3 py-1.5" : "btn btn-primary"}
        >
          {isEdit ? <PencilIcon /> : <PlusIcon />}
          {isEdit ? "Edit" : "New project"}
        </button>
      )}

      <Modal
        open={open}
        onOpenChange={handleOpenChange}
        title={isEdit ? "Edit project" : "New project"}
        description="A project needs at least one viewport and one page before it can run."
      >
        <form action={formAction} className="flex min-h-0 flex-col">
          <input type="hidden" name="payload" value={payload} />

          {/* The strip's bottom border is the rule the active trigger's
              accent underline sits on (`-mb-px` in DialogTab), same as the
              settings tabs. The body keeps a floor height so switching to a
              short tab doesn't shrink and re-centre the whole dialog. */}
          <Tabs.Root
            value={tab}
            onValueChange={(next) => setTab(next as DialogTab)}
            className="flex min-h-0 flex-col"
          >
            <Tabs.List aria-label="Project sections" className="flex shrink-0 border-b border-border px-3">
              <DialogTab value="general" label="General" incomplete={incompleteSections.general} />
              <DialogTab
                value="pages"
                label="Pages"
                summary={filledPages.length}
                incomplete={incompleteSections.pages}
              />
              <DialogTab value="schedule" label="Schedule" summary={schedule.enabled ? "On" : "Off"} />
            </Tabs.List>

            <div ref={bodyRef} className="min-h-[17rem] flex-1 overflow-y-auto px-6 py-5">
              <Tabs.Content value="general" className="space-y-6 outline-none">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Name" htmlFor="project-name">
                    <input
                      id="project-name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="My Project"
                      autoFocus
                      className="field-input w-full"
                    />
                  </Field>
                  <Field label="Base URL" htmlFor="project-base-url">
                    <input
                      id="project-base-url"
                      value={baseUrl}
                      onChange={(event) => setBaseUrl(event.target.value)}
                      placeholder="https://example.com"
                      className="field-input w-full"
                    />
                  </Field>
                </div>

                <section className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-text-faint">Viewports</h3>
                  <ViewportPicker selected={presetIds} onChange={setPresetIds} />
                </section>
              </Tabs.Content>

              <Tabs.Content value="pages" className="space-y-3 outline-none">
                {pageDrafts.map((draft, index) => (
                  <div
                    key={draft.id ?? `new-${index}`}
                    className="rounded-sm border border-border bg-surface-alt/40 p-3"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-mono text-xs text-text-faint">Page {index + 1}</span>
                      {pageDrafts.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removePage(index)}
                          className="btn btn-danger px-2.5 py-1 text-xs"
                        >
                          <TrashIcon />
                          Remove
                        </button>
                      )}
                    </div>
                    <PageFields
                      value={draft}
                      onChange={(next) => updatePage(index, next)}
                      idPrefix={`page-${index}`}
                    />
                  </div>
                ))}
                <button type="button" onClick={addPage} className="btn btn-quiet">
                  <PlusIcon />
                  Add another page
                </button>
              </Tabs.Content>

              <Tabs.Content value="schedule" className="space-y-5 outline-none">
                <ScheduleFields
                  value={schedule}
                  onChange={setSchedule}
                  timeZone={timeZone}
                  automatedRunLimit={automatedRunLimit}
                  automatedRunsUsed={automatedRunsUsed}
                  hasPages={filledPages.length > 0}
                />
                <NotifyToggle
                  checked={notifyOnFailure}
                  onChange={setNotifyOnFailure}
                  mailConfigured={mailConfigured}
                  hasEmail={hasEmail}
                />
              </Tabs.Content>
            </div>
          </Tabs.Root>

          <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
            {showError && state.error ? (
              // A real save failure always wins over the checklist below - it's
              // the more urgent fact, and only one of the two can be true at a
              // time (a failed save implies canSubmit was true). An error is
              // not a live-region update, so it keeps its own plain element.
              <p className="mr-auto min-w-0 text-sm text-danger">{state.error}</p>
            ) : (
              // Permanently mounted (content is the hint or nothing) rather
              // than the element itself appearing/disappearing: an
              // aria-live region only announces mutations to content already
              // in the tree - a screen reader will not reliably announce
              // text that arrives in the same paint as the aria-live
              // attribute. Mounting the <p> once and only ever swapping its
              // text is what makes "cleared the name" or "unticked the last
              // viewport" actually get announced, not just the first render.
              // text-text-muted, not text-danger - nothing is broken, the
              // form is just incomplete (CLAUDE.md §9). Same pattern as the
              // zoom readout in comparison-viewer.tsx.
              <p aria-live="polite" className="mr-auto min-w-0 text-sm text-text-muted">
                {missingRequirements}
              </p>
            )}
            {/* shrink-0 on both: without it the error text pushes the buttons
                narrower and wraps their labels mid-word (CLAUDE.md §9). */}
            <button type="button" onClick={() => handleOpenChange(false)} className="btn btn-quiet shrink-0">
              Cancel
            </button>
            <button type="submit" disabled={!canSubmit || isPending} className="btn btn-primary shrink-0">
              {isPending ? "Saving…" : isEdit ? "Save changes" : "Create project"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
