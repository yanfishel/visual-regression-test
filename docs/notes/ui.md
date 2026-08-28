# UI & theming — full notes

Detailed write-ups behind CLAUDE.md §9. The summary and trap index live there;
this file keeps the full reasoning and trap histories.

## Screen map

Which files make up which screen (moved here from CLAUDE.md on 2026-08-18 —
it drifts with every PR and is only needed when you are already inside the
UI). Layout conventions: `apps/web/src/components/*.tsx` is flat except for
`landing/`, `live/` and `settings/`; every pure helper is a plain module in
`apps/web/src/lib/*.ts` with its vitest file beside it (route folders only
hold `page.tsx`, `data.ts`, `actions.ts`); `lib/live/*` is the SSE plumbing.
Several components are shared across screens — `project-dialog.tsx` (create
on `/projects`, edit on the project page), `run-outcome-pill.tsx`
(cards, run table, run page), `run-trigger.tsx`, `viewport-chip.tsx`,
`delete-project-dialog.tsx`, `settings/role-badge.tsx` (also `user-menu.tsx`)
— they are listed once, under the screen that owns them.

| Route / area          | Components                                                                                     | Lib / route modules                                                                                            |
|-----------------------|------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------|
| `/` + `/about` landing | `landing/landing-content.tsx`, `landing/hero-visual.tsx` (`HeroDiffSlider`), `landing/plans.tsx`, `landing/faq.tsx` (Radix accordion), `landing/reveal.tsx`, `sign-in-opener.tsx`, `footer-about-link.tsx` | `plan-tiers.ts`, `faq.ts`, `landing-sections.ts`, `external-links.ts`; `app/actions.ts` (`createProjectAction`) |
| `/projects`           | `project-card.tsx` + `schedule-pill.tsx`, `projects-toolbar.tsx`, `owner-filter.tsx`, `runs-timeline.tsx`, `recent-activity.tsx`, `live/worker-status.tsx`, `delete-project-dialog.tsx`, `run-outcome-pill.tsx`, `run-trigger.tsx` | `project-cards.ts`, `project-filters.ts`, `project-filter-display.ts`, `project-owners.ts`, `recent-runs.ts` (`resolveOwnerScope`), `run-history.ts`, `chart-ticks.ts`, `time-ago.ts`, `delete-project.ts`, `run-outcome.ts`, `schedule-display.ts`, `schedule-quota.ts`; `app/(app)/projects/actions.ts` (`deleteProjectAction`) |
| `/projects/[projectId]` | `project-dialog.tsx` + `page-fields.tsx` + `viewport-picker.tsx` + `schedule-fields.tsx` + `schedule-day-strip.tsx` + `notify-toggle.tsx`, `site-favicon.tsx`, `viewport-chip.tsx`, `run-shot-slider.tsx`, `run-button.tsx`, `runs-table.tsx` + `run-row.tsx` + `runs-toolbar.tsx` + `date-range-filter.tsx`, `live/queued-run-warning.tsx`, `schedule-status.tsx` | `page-selection.ts`, `viewport-selection.ts`, `baseline-guard.ts`, `favicon-release.ts`, `quota.ts`, `project-dialog-requirements.ts`, `schedule-strip.ts`, `run-slides.ts`, `run-filters.ts`, `run-filter-display.ts`, `run-date-range.ts`, `run-duration.ts`, `run-timestamp.ts`, `run-capture-counts.ts`, `run-comparison-counts.ts`, `run-trigger-display.ts`, `run-failure-details.ts`, `schedule-write.ts`; route `actions.ts` (`triggerRunAction`, `saveProjectAction`, `toggleScheduleAction`) + `lib/queue.ts` (`getRunQueue`, the only place web enqueues) |
| `…/runs/[runId]`      | `capture-failure-card.tsx`, `approve-all-dialog.tsx`, `live/run-progress.tsx`                   | route `data.ts` (`buildRunGrid`, `groupRunGrid`, `getRunResultData`), `grid-order.ts` (`compareGridOrder` — shared with the slider), `approve-comparisons.ts`, `capture-failure-display.ts`, `comparison-status.ts`, `diff-score.ts`, `region-report.ts`; route `actions.ts` (`approveRunAction`) |
| `…/comparisons/[comparisonId]` | `comparison-viewer.tsx`, `comparison-nav.tsx`, `region-overlay.tsx`, `region-list.tsx`   | route `data.ts` (siblings/index, baseline run), `comparison-walk.ts`, `keyboard-shortcuts.ts`, `region-report.ts`, `app/api/comparisons/[comparisonId]/diff/*` (overlay + cache); route `actions.ts` (`approveComparisonAction`) |
| `/settings`           | `settings/settings-tabs.tsx`, `settings/users-toolbar.tsx`, `settings/user-role-select.tsx`, `settings/role-select.tsx`, `settings/role-badge.tsx`, `settings/role-limits-form.tsx`, `settings/registration-toggle.tsx` | `user-filters.ts`, `user-stats.ts`, `user-summary.ts`, `role-display.ts`, `clerk-admin.ts`; route `actions.ts` (`updateUserRoleAction`, `saveRoleLimitsAction`, `toggleRegistrationAction`) |
| Shell                 | `header.tsx`, `footer.tsx`, `theme-menu.tsx`, `user-menu-frame.tsx` + `user-menu.tsx` (clerk) + `local-user-menu.tsx` (none) + `email-address-dialog.tsx`, `live/worker-indicator.tsx`, `live/live-provider.tsx`, `breadcrumbs.tsx`, `local-time.tsx` + `time-zone-provider.tsx`, `toast.tsx`, `modal.tsx`, `select-menu.tsx`, `combobox.tsx`, `pagination.tsx`, `icons.tsx` | `query-params.ts`, `pagination.ts`, `time-zone.ts`, `viewer-time-zone.ts`, `form-state.ts`, `authz.ts`, `auth/*` (mode, user, provision, `email.ts` → `hasRealEmail`), `mail-status.ts` (`getMailConfigured`), `stored-image-response.ts` (shots + favicons routes), `live/*` (broker, bridge, source, snapshot, event-scope, own-queue, prune-runs, sse); `app/actions.ts` (`updateEmailAction`, `sendTestEmailAction`), `app/api/events/{route,handler}.ts`, `app/api/shots/[key]/*`, `app/api/favicons/[key]/*` |

## Shell & theming

The web app has a header/footer shell and a light/dark theme, built before
the diff viewer so the other screens (project list, project detail, run
results) had a consistent look to land in.

- **Design tokens** live as CSS custom properties in
  `apps/web/src/app/globals.css`: the light palette on bare `:root`, dark
  overrides on `.dark`. `tailwind.config.ts` exposes them as ordinary Tailwind
  colors (`bg-surface`, `text-muted`, `border-border`, `bg-accent`, …), so
  components use normal utility classes and never reference `var(--…)`
  directly — except where a utility class cannot reach: SVG `stroke`/`fill`
  and inline gradient/box-shadow styles in the charts (`runs-timeline.tsx`,
  the diff viewer's region overlays) read the tokens as `var(--success)`, `var(--surface)`
  and so on.
- **Theme switching** toggles a `dark` class on `<html>` — not a bare
  `prefers-color-scheme` media query — so the user's explicit choice can
  override the OS setting. The header control is a dropdown
  (`components/theme-menu.tsx`, Radix DropdownMenu radio group) with three
  entries: **System** (the default), Light, Dark. Only an explicit override
  is persisted to `localStorage` (`vrt-theme` = `light` | `dark`); choosing
  System *removes* the key, so "no key" and "system" are the same state and
  a fresh browser writes nothing. While on System the component listens to
  the `prefers-color-scheme` media query and flips the class live. The
  trigger shows the icon of the *preference* (monitor / sun / moon), not of
  the theme currently painted, so System reads as its own state rather than
  as whichever of light/dark the OS happens to be on. The stored value is
  applied *before* hydration via a `next/script strategy="beforeInteractive"`
  script in `layout.tsx` (`dark = stored === "dark" || (stored !== "light"
  && matchMedia(dark).matches)` — the value set must stay in sync with the
  component), so there's no flash of the wrong theme on load. `<html>`
  carries `suppressHydrationWarning` precisely because of that script: it
  adds `class="dark"` before React hydrates, which React would otherwise
  report as a mismatch against the server's class-less markup. The flag
  covers that one element, not its children, so real mismatches deeper in
  the tree still surface.
- **Reusable component classes** (`.btn`, `.btn-primary`, `.btn-quiet`,
  `.panel`, `.field-input`, `.pill-*`) live in `globals.css` under `@layer
  components`, so repeated patterns don't turn into copy-pasted Tailwind
  utility strings across every page. Destructive buttons use `.btn-danger`
  with `TrashIcon` — a labelled red button, not a bare link.
- **Brand mark**: the header logo is lucide's `git-compare-arrows` icon
  (hand-copied inline SVG, not an icon package dependency) in an
  accent-colored badge, next to the "Visual Regression Test" wordmark. The
  same icon is the site favicon (`app/icon.svg`, `app/favicon.ico`,
  `app/apple-icon.png`), rendered once with `sharp` via a throwaway script.
- **Footer** carries the author's signature: a fishart.co.il logo, a
  feedback `mailto:`, and a GitHub link. The logo PNG is a white monochrome asset, so
  it's inverted with `dark:invert-0` for the light theme rather than shipping
  two image files.
- **`robots: { index: false, follow: false }`** in `layout.tsx` is deliberate
  — this is a self-hosted internal tool and should stay out of search indexes
  even if it ends up reachable from the public internet.
- **Two shells, one header/footer.** The root layout renders `Header`,
  `children`, `Footer` and nothing else; the centered `max-w-5xl` column
  lives in `app/(app)/layout.tsx`, so every app screen sits inside it while
  the landing page at `app/page.tsx` paints full-bleed sections. `(app)` is a
  route group — it adds no URL segment, so `/projects/…` keeps its paths. The
  project list is `/projects`, **not** `/`; anything linking to it (the
  project page's breadcrumb, `NEW_PROJECT_HREF`) must point there.
- **The header has no nav menu and no "New project" button.** The former
  Projects/Activity/Settings link row (and its `MobileNav` hamburger
  counterpart, `nav-link.tsx`, `nav-links.ts`) was removed: the logo links to
  `/`, signed-in users land on `/projects`, and the admin's `/settings` entry
  point lives in the avatar dropdown (`components/user-menu.tsx`). The only
  way to create a project is the button on `/projects` itself (or
  `NEW_PROJECT_HREF`, which is that same dialog opened by query param).
  **The header has one responsive rule** (`components/header.tsx`): a
  sticky 68px bar, the wordmark `whitespace-nowrap` and `hidden sm:inline`
  (below `sm` it ran under the avatar — the mark alone links home; the rule
  had been dropped by accident with the nav removal and came back with the
  comparison-page redesign), and a `shrink-0` right-hand group of 30px
  controls (worker indicator, Sign in / avatar menu, theme menu) that
  always fits one row. An earlier mobile hamburger went away with the nav
  it collapsed.
- **The `/projects` sidebar is real** (`components/recent-activity.tsx`):
  `RecentRunsPanel` is a server component reading the latest runs across
  projects from Postgres, and `WorkerStatusPanel` is a client component driven
  by `useLiveQueue()` from the live SSE stream (CLAUDE.md §9 "Live
  updates"). There is no Activity route —
  the sidebar is where recent-run activity lives. **Settings is a real route**
  (`/settings`, admin-only, clerk-mode only), reached from the avatar
  dropdown — see CLAUDE.md §12.
- **Custom avatar menu, not Clerk's `UserButton`**
  (`components/user-menu.tsx`): a Radix `dropdown-menu` styled with the app's
  design tokens — user name/email header, "Manage account" via Clerk's
  `openUserProfile()`, an admin-only Settings link, and a danger-styled
  "Sign out" via `signOut()`. Only the menu chrome is ours; account actions
  still go through Clerk's client API. The admin flag comes in as a prop from
  the server-rendered `Header` (the local `users` table is canonical, §12).
- **Both modes have an avatar menu; the chrome is shared**
  (`components/user-menu-frame.tsx`, added with e-mail notifications on
  2026-08-19). `UserMenuFrame` owns everything the two menus must not
  duplicate: the 30px round trigger button (`relative`, deliberately *not*
  `overflow-hidden` — that would clip clerk's role dot; the avatar image
  clips itself), the panel, the header block, the separator, and the two
  shared items "Help & FAQ" then "About VRT". Mode-specific items go in as
  `children`; the `footer` slot exists for exactly one reason — clerk's
  "Sign out" has to stay *last*, below the shared pair, where the muscle
  memory expects it, and children render above them.
- **None mode's menu** (`components/local-user-menu.tsx`) is what the header
  renders when `AUTH_MODE=none` (previously that corner had no control at
  all). It differs from the clerk one on purpose: a generic `UserIcon` in a
  ringed circle instead of a photo (there is no profile to fetch one from),
  **no role dot** — the default row is nominally `admin` but roles mean
  nothing without other users — and **no Settings and no Sign out**
  (`/settings` is clerk-only: role limits and the registration toggle are
  meaningless single-user, and there is nothing to sign out of). Its one own
  item is "E-mail address…", the address notifications go to. The header
  passes `email={hasRealEmail(user) ? user.email : null}` and
  `mailConfigured={getMailConfigured()}`, so the panel's subtitle reads the
  address or "No e-mail address yet".
- **The e-mail address dialog** (`components/email-address-dialog.tsx`) is
  that item's target: a small `Modal` with one `type="email"` field, Cancel /
  Save, and a `btn-quiet` **Send test e-mail** pushed to the left with
  `mr-auto`. Save calls `updateEmailAction` (none mode only — CLAUDE.md §12,
  auth.md), which writes `users.email` of the default row; on success it
  toasts, calls `router.refresh()` so the header's own subtitle updates
  immediately, and closes. The test button's disabled reasons are spelled out
  in a permanently mounted `aria-live="polite"` hint (the same pattern as the
  project dialog's footer checklist — the text swaps, the element stays):
  "E-mail isn't configured on this instance (SMTP_URL, MAIL_FROM, APP_URL)."
  or "Save an address first."; when neither applies the hint explains what
  the button is for. The dialog is mounted *outside* `UserMenuFrame`, because
  Radix unmounts a dropdown's content on close and the item's `onSelect`
  closes the menu — a dialog rendered inside would vanish with it. Reopening
  resets the field from the server value (`useEffect` on `open`), like the
  project dialog.
  **Known limitation:** the address dialog opens with focus on the modal's
  Close button rather than the input — Radix's open-autofocus lands there
  before the field's `autoFocus`, exactly as in the project dialog. Not
  fixed; it is consistent across the app's modals.
  **Known limitation:** an address, once saved, can only be *changed*, not
  cleared — `updateEmailSchema` requires a valid address, and the placeholder
  is not typeable. Opting out is per project (untick the toggle), which is
  the level the setting actually matters at.
- **Breadcrumbs, not back-links** (`components/breadcrumbs.tsx`): every
  nested screen (project, run, comparison) opens with the full ancestor
  trail — chevron-separated links, current page as plain text — styled like
  the `/projects` eyebrow line (`font-mono text-xs uppercase tracking-wider
  text-text-faint`). The app column's top padding is `pt-4` (vs `pb-10`)
  precisely so the trail sits close under the header. The run label in the
  trail comes from `lib/run-timestamp.ts` (`formatRunTimestamp`), shared
  with the run page's heading.
- **`components/icons.tsx`** collects every hand-drawn inline SVG icon used
  anywhere in the app (previously scattered as a private function in
  whichever component first needed it) — add new icons there, not back
  inside the component that needs them.

**Known trap (flex text wrap):** a flex-laid-out header row where a child's
text wraps even though there's clearly enough horizontal space — caused by
flex children defaulting to `min-width: auto`, which lets them shrink (and
wrap their text) below their content's natural width before the browser lets
sibling groups get squeezed. Any toolbar row with several flex groups (logo,
nav, actions) needs `shrink-0` on each group, or one will start wrapping text
at surprisingly wide viewports.

**Known trap (`next build` vs `next dev`):** running `next build` while
`next dev` is also serving from the same `apps/web/.next` directory corrupts
the dev server's build manifest — already-open tabs keep working over their
live Fast Refresh/HMR socket, but a fresh HTTP request 500s. Stop the dev
server (or build from a separate worktree/CI) before running a production
build locally.

## Landing page

`components/landing/` is the public face, built ahead of the
app becoming multi-user. Its centerpiece is `HeroDiffSlider`: a browser-window
mock of a page skeleton rendered twice — once as the baseline, once as a
current run where a promo banner appeared — with a curtain sweeping between
them, echoing the diff viewer's curtain mode. `ParallaxViewports` drifts the
three viewport presets behind it at different scroll rates. Animation is
`framer-motion`; every piece checks `useReducedMotion` and falls back to a
static render.

**Known trap:** the *current-run* skeleton is the one in normal flow and the
baseline is the absolutely-positioned overlay, not the other way around. The
regression makes the current run the taller of the two, and the flow child is
what gives the mock its height — swap them and the taller layer gets clipped.

### Where it lives, and who sees it (2026-08-16)

The project list, not the landing, is home for anyone the app knows:
`app/page.tsx` calls `getOptionalUser()` first and redirects to `/projects`
when it resolves. In clerk mode that means every signed-in user; in none mode
`getOptionalUser()` always resolves the default user, so `/` there is *never*
the landing.

That would have buried the landing, so it got a second, permanent address:
the sections moved out of `app/page.tsx` into
`components/landing/landing-content.tsx` (a plain server component, no auth or
query-param handling), and both `/` (signed-out branch, plus `SignInOpener`)
and `app/about/page.tsx` render it. `middleware.ts` lists both as public —
a protected `/about` would bounce a guest to `/?sign-in=1`, i.e. to the same
page it was already showing.

Two entrances, deliberately quiet ones, since this is a returning user's
"what is this again?" link and not a nav item:

- an "About VRT" item in the avatar dropdown (`user-menu.tsx`), above the
  Sign out separator, preceded by a **"Help & FAQ" item** (`HelpCircleIcon`)
  that deep-links to `/about#faq` — the FAQ is the app's only help text
  (CLAUDE.md §9), so it earns its own entry instead of hiding behind
  "About", and it comes first because help is what a signed-in user opens
  the menu for far more often than the landing page. Clerk mode only — none
  mode renders no avatar menu at all, so there the footer link below is the
  only entrance.
- the footer's "About" text link, left of the mail/GitHub icons
  (`footer-about-link.tsx`, a client component only because it needs
  `usePathname`: on `/about` itself it renders as plain `aria-current="page"`
  text, the same "the current page is never a link" rule the last
  `Breadcrumbs` crumb follows). The footer has no auth context and shows it
  to everyone; harmless, because for a guest it points at what they are
  already reading.

A first attempt put the link in the header instead, as a round info icon
beside the theme menu; dropped on review — the header is deliberately
nav-free, and the dropdown is already where the app's "about me / my
account" items live.

The header logo follows the same rule as `/` itself — `href={user ?
"/projects" : "/"}` — so a signed-in user's click doesn't pay for a redirect.

### Plans section (2026-08-16)

`components/landing/plans.tsx`, between the feature grid and the closing
call to action, linkable as `/about#plans` (`PLANS_SECTION_ID`, with
`scroll-mt-24` so the heading clears the header). Three cards: Free, Pro,
Self-hosted, each listing the same three figures — projects, pages per
project, runs per day.

**The two hosted tiers read `role_limits` live** (`lib/plan-tiers.ts`:
`getPlanTiers` does the one query, `buildPlanTiers` is the pure part the
test covers), so the page can never advertise a ceiling `lib/quota.ts`
doesn't enforce, and an admin editing the limits in `/settings` moves the
pitch with them. A role whose row is missing falls back to
`DEFAULT_ROLE_LIMITS` rather than dropping the card. Self-hosted is not a
role — a none-mode visitor is the admin every quota check skips — so its
figures are the `∞` mark, with an `sr-only` "Unlimited" beside each.

**Known trap:** this made `/about` a database-reading page, so it needed
`export const dynamic = "force-dynamic"` like `/` already had; without it
`next build` tries to prerender it with no `DATABASE_URL` around.

Design decisions worth keeping:

- **The emphasized card is Self-hosted, not a middle "recommended" one.**
  Nothing here is for sale — Pro is a mailto, not a checkout — so a
  ribbon nudging toward the middle column would be theatre. Emphasis
  (accent border, accent figures, the only `btn-primary` of the three)
  goes on the thing the project actually offers.
- Chip hues repeat the role palette (§9): Free takes the plain `user`
  role's `info`, Pro the `pro` role's `success`, Self-hosted the accent.
  Tier names are spelled out, so no meaning rides on colour alone.
- Quota rows are a **fixed height** (`h-[3.25rem]`), not baseline-aligned:
  the `∞` glyph draws small in a mono face and needs a size up, and on a
  baseline-aligned row a taller figure sits lower — three rows in, the
  self-hosted card's figures no longer lined up with its neighbours'.
- The grid breaks to three columns at `md`, not `sm`. At 640px the cards
  were ~187px wide: eyebrows wrapped to three lines, "Pages per project"
  to two, and the wrapping headers knocked the figure rows out of
  alignment card to card.
- A `landing-grid` backdrop on the featured card was tried and dropped —
  its vertical lines fought the row rules right where the figures are.

The mail address and the repo URL live in `lib/external-links.ts`; the
footer icons and these cards are the two callers.

### FAQ section (2026-08-16)

`components/landing/faq.tsx`, between the plan cards and the closing call to
action, linkable as `/about#faq` (`FAQ_SECTION_ID`, `scroll-mt-24`). **This
is the app's help text** — there is no help screen and no docs site the UI
points at — so the fifteen answers describe what the app does *today*
(runs are manual, `diff_threshold` is not editable in any dialog) and get
re-read whenever a screen changes.

Copy lives in `lib/faq.ts` as data (`FAQ_GROUPS`: four groups — Getting
started, Selectors, Runs and review, Data and limits — each item an id, a
question, paragraphs, and an optional trailing link). Keeping it out of the
component is the same split `plan-tiers.ts` uses: the section is a client
component, and prose in JSX is harder to revise than prose in an array.
Answers are plain strings for the same reason — no JSX in the data means no
markup decisions buried in the copy.

**Known trap:** the answers link to the plans section, and pulling
`PLANS_SECTION_ID` out of `lib/plan-tiers.ts` would have dragged `@vrt/db`
(and `postgres`, and `net`) into the browser bundle through the client
component — the §9 trap one module further than the query-param one. Both
anchors now live in `lib/landing-sections.ts`, a plain module with nothing
but two strings; `plan-tiers.ts` no longer exports the id.

Presentation decisions worth keeping:

- **One accordion per group, `type="single" collapsible`.** A reader follows
  one question at a time; letting a group hold several open answers turns
  the section back into the wall of text the accordion exists to avoid. The
  groups are independent roots, so opening a question in one leaves an open
  answer in another alone.
- `@radix-ui/react-accordion` rather than native `<details>`: keyboard and
  ARIA behaviour matching the rest of the Radix-based UI, and a measured
  open/close height to animate. The animation is plain CSS in `globals.css`
  (`.accordion-answer`, `@keyframes accordion-open/close`), not a Tailwind
  `animate-*` utility — it interpolates to `--radix-accordion-content-height`,
  which Radix writes on the element itself, and a `prefers-reduced-motion`
  block drops it the way `Reveal` drops its fade.
- **Groups sit in a two-column grid from `md`**, not a single narrow
  column. A `max-w-3xl` section was tried first — the answers are prose and
  a full-width measure reads as a wall — but it inset the whole section
  from the `max-w-5xl` everything above it uses, and the heading visibly
  stepped right as you scrolled past the plan cards. Two columns keep the
  page's width and still give each answer half of it to wrap in.
- Answers close with a quiet accent text link, never a `.btn` — the page's
  only buttons stay in the hero and the closing call to action.

## Project cards (/projects)

`components/project-card.tsx` opens each project card with a header bar: the
project name on the left (`min-w-0 flex-1 truncate`, so a long name
ellipsizes instead of pushing the controls out) and the edit/delete icon
buttons on the right. Below it, a preview crop of the newest finished run's
first capture (`h-32 object-cover object-top`, same crop idea as the
run-results grid; a blueprint-grid placeholder with a camera icon when there
are no captures). Capture and placeholder alike sit under a slight
`bg-black/15` scrim - plain Tailwind black, not a token, so the alpha works
- with the run-status pill top-right. Then page and viewport
counts, the last finished run's passed/failed/new figures (spelled out,
never color-only - the section 9 deuteranopia rule) and a relative
"2h ago" (`lib/time-ago.ts`). The bar went through three iterations
(browser-chrome bar with host → no bar, controls floating on the preview →
name + controls bar); the name lives in the bar, not the body.

- Card data comes from `lib/project-cards.ts` - six batched queries total
  for the whole list (pages, viewports, schedules, runs, then shots +
  comparisons of each project's newest done/failed run), no per-project fan-out. The
  preview shot is picked with the run grid's exact ordering
  (`lib/grid-order.ts` — page label, viewport widest first, shot id), so the
  card shows the run page's first card.
- The whole card is clickable via a stretched link (`absolute inset-0` on a
  `relative` article) rather than nesting the card content in an `<a>`; the
  toolbar's buttons sit above it with `z-10`. Interactive elements inside an
  interactive card must never nest in the link itself.
- **Deleting a project**: `delete-project-dialog.tsx` (shared Modal,
  `.btn-danger` confirm) posts `deleteProjectAction`, which wraps the tested
  `lib/delete-project.ts` (`findProjectForUser` scope check, then a plain
  delete - the schema cascades take pages, viewports, runs, shots, baselines
  and comparisons with it). Screenshot files stay on disk until the worker's
  retention sweep sees their hashes unreferenced. The dialog has two
  triggers: the card's quiet icon-only button here (danger on hover, Radix
  "Delete project" tooltip), and a labeled `.btn-danger` "Delete project"
  button next to Edit in the footer of the project page's config card -
  that one submits a `redirectToProjects` flag so the action `redirect()`s
  to `/projects` instead of leaving you on the deleted project's (now 404)
  page.
- **Project page config card**: body (favicon + base URL, viewport chips,
  page table) plus an action footer (Edit / Delete project, right-aligned)
  pinned to the bottom with `mt-auto` - the grid row stretches the card to
  the slider's height, and the footer echoes the slider's caption bar. The
  favicon (`components/site-favicon.tsx`) is the one the **worker** stored
  on the first run that found it - `projects.favicon_key`, served by
  `/api/favicons/[key]` exactly like a shot (content-hash URL, immutable
  cache, `streamStoredImage` in `lib/stored-image-response.ts` shared with
  the shots route, plus a CSP `sandbox` since the bytes are third-party);
  the web app never fetches the site itself. Full story in CLAUDE.md §4
  "Site favicon". A globe placeholder of the same size shows while the key
  is NULL (no run yet, site has no icon, base URL just changed) and on any
  load error. **Known trap:** the `<img>` is server-rendered, so a fast
  failure fires `error` before hydration attaches `onError` and the
  broken-image glyph would stick - the component also checks
  `complete && naturalWidth === 0` on mount. The
  page table is capped at `max-h-36` and scrolls on its own, with a
  sticky header: on a `border-collapse` table a sticky cell keeps its
  background but not its borders, and an *outer* box-shadow doesn't paint
  on collapsed cells either - the separator is an inset 1px shadow in the
  border token, and the first body row drops its `border-t` so the line
  isn't doubled while unscrolled.
- The dialog trigger for editing is `ProjectDialog trigger="icon"` - the
  same component the project page uses, just a compact `.btn-icon` trigger.
- **Search, outcome filter and pagination live in the URL** (`q`, `filter`,
  `page` - names in `lib/query-params.ts`): the server page parses them with
  `lib/project-filters.ts` and stays the single place that filters and
  paginates (in JS, over the same six batched queries - fine at
  single-owner scale). `components/projects-toolbar.tsx` is the client side:
  a debounced (~300ms) search box on the left and, pushed to the right end of
  the row (`justify-between`), the match count and the outcome dropdown, both
  just rewriting the query string via `router.replace`; any change drops
  `page`. The toolbar is deliberately the twin of the /settings user toolbar
  - same search box, same `{n} projects` count beside the same dropdown - so
  the two list screens read as one system.
  **This replaced a segmented control** (All/Passing/Failing/No-runs buttons,
  each with its own count badge). The dropdown is the shared
  `components/select-menu.tsx`; labels, dot colours and hints live in
  `lib/project-filter-display.ts`, one map per concern, the same shape as
  `lib/role-display.ts`. Two consequences of the switch worth knowing: the
  per-outcome counts are gone (the toolbar now shows one figure - how many
  projects match the *current* search and filter, which is why the page
  passes `filtered.length`, not a tally of every outcome), and so are the
  per-outcome hints. Each segment used to carry a Radix tooltip explaining
  what its filter meant; a dropdown has only its trigger to hang one on,
  where it covers the list the moment it opens - **don't put it back**. The
  option labels carry the meaning instead.
  `components/pagination.tsx` renders link-based
  Prev/numbers/Next (6 cards per page), hidden for a single page; an
  out-of-range `?page=` clamps to the nearest real page instead of 404ing.
  Outcome classification (`classifyProjectOutcome`) keys off the newest
  *finished* run's own status first - a worker-errored run can have zero
  comparisons, so failed-comparison counts alone would misread it as
  passing; this is why `ProjectCardData` carries `lastFinishedRun`.

## Settings screen (/settings)

Admin-only, clerk-mode only (CLAUDE.md §12). The page opens with the standard
breadcrumb trail (`Projects › Settings`) and splits its three concerns into
Radix tabs — **Users | Role limits | Auth** — instead of the three stacked
panels it started as. The tab strip sits *inside* the panel, not above it:
`Tabs.Root` carries the `.panel` class, the strip is the card's first row
with a full-width bottom border, and the active trigger marks itself with an
accent underline (`data-[state=active]:border-accent`) plus accent text. The
triggers carry `-mb-px` so their `border-b-2` lands on the strip's own border
instead of stacking below it. The sections are three views of one settings
card, so each panel's content is passed in bare — the card's padding lives on
`Tabs.Content`, not on the sections themselves.

- **The active tab lives in the URL** (`?tab=`, `lib/query-params.ts`;
  `parseSettingsTab` in `lib/user-filters.ts` falls back to `users` for a
  stale or missing value rather than 404ing). `components/settings/
  settings-tabs.tsx` is therefore a *controlled* `Tabs.Root` — value from the
  server, `onValueChange` doing `router.replace(..., { scroll: false })` —
  not Radix's own internal state. The user panel's search and page are query
  params too, so one mechanism covers the whole screen and any settings URL
  is reloadable and linkable.
- **The panels stay server components.** `SettingsTabs` is the only client
  piece here and takes `users` / `limits` / `auth` as `ReactNode` props, so
  the user table, the role-limits form and the registration toggle are still
  rendered on the server and passed in — the client component only switches
  between them. Switching tabs deliberately drops every other param: the
  search and page belong to the users panel alone, and carrying them along
  would resurrect a stale filter on the way back.
- **User search, role filter and pagination** mirror `/projects`: a debounced
  (~300ms) search box plus a role dropdown in
  `components/settings/users-toolbar.tsx` writing `uq` and `urole` to the
  URL, and the shared `components/pagination.tsx` over `upage` (10 rows per
  page). The params are named apart from the project list's `q`/`page` on
  purpose, so a URL carrying both never has one screen read the other's
  value. The role filter is the same `RoleSelect` as the per-row picker, with
  an extra "All roles" entry — `parseUserRole` maps anything unknown to
  `null` (no filter) rather than an empty table, and the param is only
  written for a real role.
  Filtering (`filterUsers`, case-insensitive substring over the email, then
  role equality) runs in JS on the server page — /settings already loads
  every user row to count them, and a single-admin screen with tens of users
  doesn't need an ILIKE query per keystroke. The empty state names whichever
  filters are on (`emptyUsersMessage`), so a filtered-empty table never reads
  as "there are no users".
- **Everything on this screen autosaves; there are no Save buttons** (bar the
  registration toggle, which is an explicit action rather than a field). The
  role picker (`user-role-select.tsx`) saves on `change`, the role-limits
  table (`role-limits-form.tsx`) on an 800ms debounce — long enough that
  editing several fields lands as one save and one toast, short enough to
  feel automatic. Both show a spinner in a **fixed-size slot** so the row
  doesn't shift when a save starts, and both roll their local state back to
  the server's values when the action reports an error.
- The role picker's shown value is optimistic, which is the only reason it
  keeps local state: the `role` prop catches up only once `revalidatePath`
  re-renders the page. Its resync effect is skipped while a save is in
  flight, or the pre-save render would clobber the optimistic value.
- **The two autosaving actions take a plain argument, not `FormData`**
  (`app/(app)/settings/actions.ts`), and return `ActionResult` (`{ ok: true }
  | { ok: false, error }` from `lib/form-state.ts`). The hidden-payload-input
  dance in the rest of the app exists to serve `useActionState`; with no form
  to submit there is nothing to encode, and the caller needs an answer it can
  turn into a toast. `toggleRegistrationAction` still uses the `FormState`
  shape — it still has a form.
- **Role colours and badges.** `lib/role-display.ts` is the single map from
  role to label (`Admin` / `Pro` / `User`) and colour — admin `danger`, pro
  `success`, user the **`info`** token added for it (the palette had only
  green and red, and neither can stand for "no special standing"). It is a
  plain module, not a `"use client"` file, because server components read it
  too. `components/settings/role-badge.tsx` renders the dot, optionally with
  its label; colour is never the only carrier of meaning (the section 9
  rule), so the bare dot keeps the role name in `sr-only` text plus a Radix
  tooltip. The badge appears before every email, inside each dropdown
  option, in the avatar menu header, and as a ringed dot on the header
  avatar itself — that trigger dropped `overflow-hidden` (it would clip the
  dot) and clips the image instead.
- **`RoleSelect` is a Radix Select, not a native one** (`role-select.tsx`),
  shared by the row picker and the toolbar filter: `<option>` can't hold
  markup, and every option carries its colour badge. Radix reserves `""` for
  "no value", so the filter's "All roles" entry travels as an `__all__`
  sentinel and is mapped back to `null` at the boundary.
  The Radix plumbing itself lives in **`components/select-menu.tsx`** — the
  app's one dropdown, a Radix Select styled as a `.field-input`. `RoleSelect`
  and the /projects outcome filter are both thin wrappers over it; reach for
  it whenever options need markup a native `<option>` can't hold, and keep
  the sentinel trick in the wrapper rather than in the primitive.
- **New user columns**: Projects, Runs 30d, and Last activity
  (`formatTimeAgo`, an em dash when the user never ran anything).
  `lib/user-stats.ts` computes them in two grouped queries scoped to the
  *visible page* of users, never one query per row. The quota cell is a
  three-track grid (`1fr auto 1fr`, `w-full`) so every row's slash lands in
  the same column and the counts stack; an admin has no limits row and fills
  only the count track. It must be `w-full` — sized to its content the grid
  is a different width per row and nothing lines up.
- **Narrow screens fold the table rather than scroll it.** Below `sm` the
  four figure columns go `hidden sm:table-cell` and their values reappear as
  a summary line under the email (`lib/user-summary.ts`, e.g. `3 / 10
  projects · 1 run · 1d ago · joined 2026-08-13`), leaving Email and the role
  control — the point of the screen, which must not sit behind a horizontal
  scroll. Six columns overflowed the panel and gave the *whole page* a
  scrollbar. Two details keep it that way: the email needs `break-all`
  (`vrt2+clerk_test@example.com` is one unbreakable word that sets the
  table's minimum width), and the toolbar's search box is `w-full
  sm:w-auto`, or the `shrink-0` group beside it squeezes the input down to
  its icon. **Role limits** can't fold — four number inputs — so it uses the
  house `overflow-x-auto` wrapper with `-mx-5 px-5`, cancelling the panel's
  padding so the scroll runs to the panel edges; the table itself carries a
  `min-w-[30rem]`.
  Activity keys off `runs.createdAt`, not `startedAt`: a queued run is still
  something the user did, and `startedAt` is null until the worker picks it
  up. **Known trap:** the 30-day count is a `FILTER (WHERE …)` clause built
  with drizzle's `gte`, not an interpolated `${since}` — a bare `Date` in a
  raw `sql` template reaches the driver unencoded and throws at query time.
- `paginate`/`parsePage` moved out of `lib/project-filters.ts` into
  `lib/pagination.ts` when this screen became the second consumer — they are
  domain-free list helpers, and a settings page importing a module named
  after project filters would have been a lie.

### Toasts

`components/toast.tsx` wraps Radix `react-toast`: a `ToastProvider` in the
root layout (next to the tooltip provider, for the same reason — one fixed
overlay any client component can fire into) and a `useToast()` hook giving
`success` / `error`. The viewport is top-right, offset below the 68px sticky
header rather than over it — the header is translucent, and a toast crossing
it reads as part of the chrome. Toasts exist because the autosaving /settings
controls
have no Save button to report through; the hook **throws** outside the

provider rather than no-op'ing, since a swallowed toast means a save that
silently reports nothing. Roots are controlled-open and removed from state on
close — left mounted they would stack invisible roots — and their ids come
from a counter, not `Date.now()`, which would collide for two toasts fired in
the same millisecond.

**Known trap (the global `:focus-visible` ring):** the app-wide focus ring at
the bottom of `globals.css` used to sit **outside** `@layer`, where it
outranked every Tailwind utility. Two separate bugs came out of that:

- It carried `border-radius: 5px`, which squared off the round avatar trigger
  in the header for as long as it held focus — visible right after the
  account dropdown closed, because Radix returns focus to the trigger on
  close, and the button kept the square look until the next click elsewhere.
- `outline-none` on a Radix menu or select item did nothing, so navigating a
  popup drew an accent rectangle around the highlighted option *on top of*
  its highlight — two indicators for one thing.

The rule now lives in `@layer base` and sets only `outline` and
`outline-offset`. Base ranks below components and utilities, so a control
that already shows focus its own way (`outline-none` on popup items, the
avatar's `focus-visible:ring-2`) can opt out, while everything else still
gets the ring — that part is the keyboard affordance and must stay. Don't
move the rule back out of the layer, and don't give it a radius.

## Owner filter (/projects, admin only)

`components/owner-filter.tsx` sits at the top of the `/projects` sidebar,
above the runs timeline, and only for an admin in clerk mode (`none` mode has
exactly one user to filter by). **The default is the viewing admin, not
everyone**: an admin's list is otherwise unrestricted, and every user's
projects at once stops being useful past a handful. "All users" is the first
entry when they do want the whole estate.

- State lives in the URL like every other list control here
  (`?owner=`, `ALL_OWNERS_VALUE = "all"`). Changing the owner deliberately
  drops the search, outcome filter and page - they describe a list that no
  longer exists - while the toolbar and pagination links carry the owner
  along, so narrowing within one owner keeps them.
- The option list is `lib/project-owners.ts`: everyone owning at least one
  project plus the admin themselves (they are the default, so they must be
  listed before they own anything), each with a project count, in two
  queries. `parseOwnerFilter` sends an unknown id - a deleted user, a
  hand-typed one - back to the default rather than rendering an empty list
  under a stale name.
- **It is a view control, not an authorization check.** The page still
  decides visibility the old way; the filter only narrows what an admin
  already sees. `resolveOwnerScope` (`lib/recent-runs.ts`) is the one place
  that decides: an admin gets the requested owner, everyone else is pinned to
  themselves and the param is ignored outright.
- The sidebar agrees with the list: the timeline reads the already-narrowed
  `projectIds`, and `getRecentRuns` takes the same `ownerId`. The empty state
  changes wording too - an admin looking at somebody else's empty list is not
  being invited to add a site on their behalf.

`components/combobox.tsx` is the searchable dropdown this needed: the app's
`SelectMenu` (Radix Select) can't filter, and Select's typeahead only jumps
to a prefix. It is built on Radix **Popover, not DropdownMenu** - a menu
captures keystrokes for its own typeahead, so a text input inside one never
receives what the reader types. Arrow keys and Enter are handled on the
input, with the highlighted row tracked by index rather than by DOM focus, so
typing is never interrupted.

**Known trap:** `owner-filter.tsx` imports `ProjectOwner` **as a type only**
and takes `ALL_OWNERS_VALUE` from `lib/query-params.ts`. A runtime import of
`lib/project-owners.ts` from a client component pulls `@vrt/db` → `postgres`
→ `net` into the browser bundle and the route 500s - the same failure the
`@vrt/shared/constants` rule exists to prevent, one module further along.

## Runs timeline (/projects)

`components/runs-timeline.tsx` is the top panel of the `/projects` sidebar
(above Recent runs): a **pass-rate headline over stacked columns of runs per
calendar day** for the last 7 days, with the legend in a footer row under the
plot. The two questions it answers are deliberately separate — the headline
(`62%` + `29 runs` + the week-over-week trend) says whether things are
healthy, the columns say how busy it was — because either one alone leaves
the other unreadable. Plain HTML/CSS bars in a `.panel` - no SVG needed
for rectangles, and percentage-based div heights stay crisp at any container
width where a stretched SVG viewBox would distort the 2px segment gaps and
rounded caps. Bar heights are percentages of the busiest day inside a
fixed-height plot, and every figure goes through `formatCompact`
(`lib/chart-ticks.ts`, `Intl` compact notation - 1.2K), so hundreds of runs
per day never change the panel's height. It started life above the cards
toolbar, full-width; the sidebar keeps the overview visible without pushing
the cards below the fold.

**There is no y axis.** The first version had one (four `niceTicks`
gridlines and a label gutter) and read as a default chart: the gutter ate
~25px of a 320px panel, the bars came out 16px wide in a 38px slot, and more
than half the plot was air (owner's verdict, 2026-08-16). Now the busiest
day is direct-labelled above its column, the tooltips carry the rest, and
that width goes to the marks (`w-full max-w-[22px]` — capped, never fixed,
or the bars overflow their slots once the panel is narrower than ~250px).
`niceTicks` had no other caller and was deleted with its tests;
`formatCompact` stayed.

- Data comes from `lib/run-history.ts`: a pure, unit-tested
  `bucketRunHistory` (local-calendar-day buckets - a 23:00 run belongs to
  that evening, not to a 24h offset from now; `Math.round` on the day index
  absorbs DST). **"Local" here is the server's zone**, not the viewer's
  `vrt-tz` cookie that the run table's date filter and every `LocalTime`
  use — the only place in the app that still buckets by server day; a
  viewer far from the server can see a late-evening run counted on the next
  bar. Passing the viewer zone into `bucketRunHistory` is the fix if it
  ever matters plus a thin `getRunHistory` wrapper (runs in the window +
  failed-run ids via one grouped query joined through runs, never a
  comparison lookup per run). Failed = worker errored or any comparison
  failed — `runOutcome`, the one rule (CLAUDE.md §9).
- **`getRunHistory` fetches twice the visible window.** The older half never
  reaches a bucket; it only rates the preceding 7 days so the headline can
  show `▼ 9 pts vs prev 7d`. Same two queries as before, roughly twice the
  rows of a small table. Both rates are rounded to whole percent *before*
  subtracting, so the trend always agrees with the figure on screen (62
  against 71 reads as 9 points, never 8.6).
- **Queued and running runs are counted as `pending`**, drawn as a neutral
  hatched cap on top of the day's stack, and kept out of every pass rate.
  Before this the status filter dropped them and today's column read as a
  bad day whenever it was merely unfinished. A day with *no* runs draws a
  faint dot on the baseline instead — "nobody ran anything" is not "every
  run passed".
- The timeline always covers every project the user can see - the toolbar's
  search/filters only narrow the cards below it. With no *finished* run in
  the window (`passRatePercent === null`) the panel renders nothing at all:
  there is no rate to lead with, and an empty chart above an empty project
  list is pure noise for a fresh install.
- The section 9 deuteranopia rule, one carrier richer: the failed fill
  keeps the 45-degree hatch, all totals are spelled out in the legend, **and
  the baseline turns `danger` under every day that broke** — a capped tick,
  centred like the bar above it — so a failure is found by position before
  colour. The trend arrow is a filled `CaretUp/DownIcon` beside the signed
  figure, never colour alone. Each day's full column is the hover target
  (wider and taller than the thin bar) for a Radix Tooltip - the component
  is `"use client"` for exactly this reason - and an `sr-only` table carries
  the per-day figures for screen readers while the visual chart is
  `aria-hidden`. The last bucket is today by construction, so its weekday
  initial wears `text-accent`: today is still counting.
- **Known trap:** the component may import `lib/run-history.ts` **as types
  only**. It is a client component and that module reaches `@vrt/db` →
  `postgres` → `net`; a runtime import (a `passRateDelta()` helper, in the
  first cut of this redesign) 500s the whole route with `Can't resolve
  'net'`. The trend is therefore a *field* on `RunHistory`
  (`passRateDeltaPoints`), computed and unit-tested inside
  `bucketRunHistory`.
- **Tooltips are always Radix** (`@radix-ui/react-tooltip` off the provider
  in the root layout), styled `bg-text text-bg` like the diff viewer's -
  never the native `title` attribute, which is unstyled, slow to appear and
  looks out of place next to the rest of the app (owner preference,
  2026-08-15; the timeline's first version used `title` and was converted).

## Project setup dialogs

A project is configured **only** in a modal — the project page has no inline
forms, delete links, or per-row controls at all. The page is: a title row with
the project name and "Run", a compact configuration card, and the run table
(see "Project run table" below).

**The Run button is disabled while a run of this project is queued or
running, and its label says so** — "Queued…" / "Running…" with the outcome
pill's spinner (`run-button.tsx`, fed the in-flight run's status by the
page). One run per project at a time is already the server's rule
(`assertNoActiveRun`, CLAUDE.md §12); before this the button stayed live
and the click came back as an inline rejection. A disabled button that
goes grey without a word is the thing to avoid, so the state is in the
label itself, not a tooltip (which wouldn't open on a disabled control
anyway). It turns back into "Run" through the live feed's
`router.refresh()` when the run finishes — no polling in the button.
The card holds the base URL, an "Edit" button, the viewports as badges and a
table of pages (Page / Path, plus Wait and Masks columns only when some page
uses them); the shot slider sits beside it as a separate card (see "Project
page shot slider" below). Neither
list carries a visible heading — the content reads as itself, and the headings
are `sr-only` so the structure survives for screen readers. The card's three
blocks share one `space-y` step rather than per-block margins, so the rhythm
stays even.

- **`components/modal.tsx`** wraps `@radix-ui/react-dialog` with the app's own
  chrome (overlay, panel, title, close button). Focus trap, Escape and
  click-outside come from Radix. Every modal goes through it. **Modals are
  anchored to the top of the viewport (`top-[6vh]`), not centred**: a
  dialog whose height changes while open (the project dialog's tabs)
  re-centred and jumped under the pointer on every switch; with a fixed
  top edge the header, tab strip and footer stay put and the body grows
  downwards. Applies to every modal, the small confirmations included —
  one placement rule, not two.
- **`components/project-dialog.tsx`** is one component for creating *and*
  editing: with a `project` prop it edits, without it it creates. Name, base
  URL, the viewport multi-select, and the page list with "Add another page"
  and a red Remove button per row all live there.
  `components/page-fields.tsx` holds one page row's fields and draft type.
- **The dialog is three tabs — General · Pages · Schedule** (Radix Tabs,
  the same strip `/settings` uses), not one scrolling column. It used to be
  one column, and the schedule sat under the page list — the only unbounded
  block — so on any project with two pages nobody saw there *was* a schedule
  section. The tabs are the dialog's three different jobs: General (name,
  base URL, viewports — set once), Pages (the working list), Schedule (its
  own subsystem, its own row). **Each trigger carries a summary** ("Pages ·
  2", "Schedule · On") so every section's state is readable without
  visiting it — the schedule is discoverable from the strip alone — and a
  small `warning` dot (with `sr-only` "(incomplete)") on the tab that still
  holds an unmet save requirement (`incompleteProjectSections` in
  `lib/project-dialog-requirements.ts`, grouped exactly like the tabs; the
  footer still spells the requirement out, the dot only says *where*).
  Every open starts on General; the draft state lives in the dialog, not
  the tab panels, so switching loses nothing. The body has a floor height
  (`min-h-[17rem]`) so a short tab doesn't collapse the dialog, and the
  modal itself is top-anchored (see `modal.tsx` above) so the height it
  does gain never moves the strip.
- **The Schedule tab ends with a Notifications section**
  (`components/notify-toggle.tsx`, 2026-08-19). It is one checkbox —
  "E-mail me when a scheduled run fails" with a `text-muted` sub-line "Only
  scheduled runs; one e-mail per failure until the run is approved or passes
  again" — over a `border-t` rule under a small uppercase "Notifications"
  heading, so it reads as its own block rather than another schedule field.
  It lives on the Schedule tab and not on General because it is a property
  of *scheduled* runs: with no schedule there is nothing to be notified
  about. State is `notifyOnFailure` in the dialog's own draft, sent in the
  same JSON `payload` as everything else and written to
  `projects.notify_on_failure` (CLAUDE.md §4 "Notifications"); the dialog
  takes `mailConfigured` / `hasEmail` as props from the server page
  (`getMailConfigured()`, `hasRealEmail(user)`), and `project-card.tsx`
  forwards the same pair on `/projects`.
- **Its two disabled reasons are spelled out, never a silent grey box**
  (CLAUDE.md §9): "E-mail isn't configured on this instance (SMTP_URL,
  MAIL_FROM, APP_URL)." when the instance has no SMTP, and "Add your e-mail
  address in the account menu first." when the viewer's address is still the
  none-mode placeholder. Both live in `lib/mail-copy.ts` (a plain module, so
  the address dialog and `sendTestEmailAction` say them word for word — they
  had already drifted in punctuation) and sit in the same `text-xs
  text-text-muted` paragraph under the checkbox, which the checkbox points
  at with `aria-describedby` while it is disabled; when neither applies that
  paragraph holds a
  **Send test e-mail** button instead (`sendTestEmailAction`, toast on both
  outcomes) — the way to prove the wiring before waiting for a real
  scheduled failure. It is styled inline as an accent text link because the
  app has no `.btn-link` primitive and one control did not justify inventing
  one.
- **A page row is Label | Path; Wait selector and Mask selectors fold behind
  "Advanced"** (a disclosure button per row, `page-fields.tsx`). Most pages
  need neither, and four inputs per page made two pages fill the dialog.
  A row that already has either value opens unfolded — hiding a value the
  reader set would look like it was lost. Whether the fold is open is local
  row state, not draft state (a fact about the screen, not the page); the
  dialog content unmounts on close, so every open starts folded again.
- **Creating** inserts project + viewports + pages in a single
  `db.transaction`; **editing** submits the whole project and lets
  `lib/page-selection.ts` / `lib/viewport-selection.ts` decide the writes.
  Existing pages carry their id and are **updated in place**, so a rename or a
  mask-selector tweak keeps that page's shots and baselines; a page whose id
  disappears from the list is deleted. This is the only write path for pages
  and viewports after creation.
- **"Add another page" scrolls to what it added.** A new row is appended at
  the bottom of the Pages tab's scrolling body, below the fold on any project
  that already has a few pages, so the click looked like it did nothing.
  The dialog remembers the added index, then takes the body to
  `scrollHeight` and focuses that row's Label (`focus({ preventScroll:
  true })` first, so the two don't fight). Bottom rather than
  `scrollIntoView` on the row: a new row is always last, so that lands on
  the whole card *and* the button under it.
- **Editing state is local until Save.** Removing a row or unchecking a
  viewport changes nothing server-side until the form is submitted, and
  reopening the dialog re-seeds every field from the server's current data, so
  a cancelled edit leaves nothing behind.
- **Dialog forms submit one JSON `payload` field** (`lib/form-state.ts`) rather
  than flat form fields: the row list lives in React state, so there is nothing
  to gain from form encoding. Server actions parse it with zod and return
  `{ error }` through `useActionState` instead of throwing into the error
  boundary. The trade-off is that these forms need JS — acceptable, since the
  dialog does too.
- **Opened by query param**: `NEW_PROJECT_HREF` (`/projects?new=1`,
  `lib/query-params.ts`) is what the landing page's CTAs link to, and the
  `/projects` page reads it from `searchParams` and mounts the dialog open —
  so server components can offer "New project" without a dialog context.
  Closing `router.replace`s the param away.

**Known trap (stale action error):** `useActionState` holds its last result
for as long as the component is mounted, and both dialog components are
mounted by their *trigger*, not by the open dialog — so a rejected save
("Can't remove a page or viewport whose shots are still an approved
baseline.") was still in the footer the next time the dialog opened, on a
form that had just been re-seeded from the server. There is no reset API;
both `project-dialog.tsx` and `delete-project-dialog.tsx` gate the message
behind a `showError` flag that opening clears and a finished submit sets.
The same rule made the delete dialog route both its triggers through a
`handleOpenChange` instead of `setOpen`.

**Known trap (wrapped button labels):** the dialog footer is a flex row with
the error text on `mr-auto`; a long message shrank the buttons until "Save
changes" wrapped mid-phrase. Same rule as the toolbars — `shrink-0` on each
button, `min-w-0` on the message so it wraps instead.

**Known trap (query params):** the query-param name lives in
`lib/query-params.ts`, a plain module, *not* in the `"use client"` dialog
file. Every export of a client module becomes a client reference when a
server component imports it, so the constant silently isn't a string on the
server and the param never matches — the dialog just never opens, with no
error anywhere.

**Known trap (shared imports):** client components must import shared
constants from `@vrt/shared/constants` (an explicit `exports` subpath), not
from the package root. The root barrel re-exports the redis helper, so
importing it into a client component pulls `ioredis` into the browser bundle
and the build fails on `Can't resolve 'net'`.

**Known trap (token alpha):** the design tokens are raw `var(--…)` colors, so
Tailwind's alpha modifiers (`border-danger/40`) can't work — Tailwind has no
channel values to compose. `@apply`ing one fails the CSS build with "class
does not exist"; use a `-soft` token instead.

## Project page shot slider

`components/run-shot-slider.tsx` is the card beside the
configuration card: a pure preview that flips through the latest finished
run's captures — no zoom/pan, that lives on the run and comparison pages —
with the image itself linking to that run, a caption naming page + viewport,
and a `landing-grid` "No captures yet" placeholder before the first run. Its
slides come from `lib/run-slides.ts` (`buildRunSlides`), built in the run
grid's exact deterministic order (`compareGridOrder` in `lib/grid-order.ts`
— CLAUDE.md §4; the slider once had its own label-based sort and ordered
Desktop/Mobile/Tablet while the grid ordered Desktop/Tablet/Mobile) so
flipping through the slider walks the run page top-to-bottom. The
client component clamps its index when a live refresh shrinks the list. The
column is capped (`minmax(0, 360px)`) so a wide capture can't push the
config card off the row.

## Project run table

The run list under the configuration card is a table
(`components/runs-table.tsx`): *Started · Trigger · Duration · Captures ·
Passed · Failed · New · Status*, 10 rows per page, with an outcome filter. It
grew out of a plain `<ul>` of the latest 20 ISO timestamps and status pills,
which said nothing about *what* a run found (2026-08-15).

- **Filter and pages live in the URL** — `?outcome=failed|passed` and
  `?rpage=` (`lib/query-params.ts`; named apart from the `/projects` list
  params like the `/settings` ones), parsed by `lib/run-filters.ts`
  (`parseRunFilter`, `filterRuns` — the outcome per run through
  `runOutcome`, so pending runs match neither finished filter and only show
  unfiltered) and sliced with the shared `paginate`/`parsePage`. The
  toolbar (`components/runs-toolbar.tsx`: `{n} runs` + the `SelectMenu`
  dropdown, display maps in `lib/run-filter-display.ts`) is the `/projects`
  toolbar minus the search box and only renders once the project has a run;
  a filter change drops the page param. The server page fetches the
  **whole** run history plus one grouped comparison-count query for it —
  the filter needs every run's verdict before it can pick a page — and
  fetches capture counts only for the rows shown. Retention keeps that
  history bounded; if it ever isn't, the filter moves into SQL.
- **Date range** — `?from=YYYY-MM-DD&to=YYYY-MM-DD`, either side optional
  (`lib/run-date-range.ts`: `parseDateRange` validates and swaps backwards
  bounds; `filterRunsByDate` compares each run's *calendar day in the
  viewer's zone* — `localDateKey`, an `en-CA` formatter in the `vrt-tz`
  cookie's zone, UTC when there is none — against the bounds as YYYY-MM-DD
  strings, so no offset arithmetic). The bounds are the days the viewer
  clicked in a calendar, so they must be judged in the viewer's calendar: a
  run at 22:30Z on the 15th is an Aug 16 run to someone in Jerusalem, and
  filtering it into "Aug 15" would look like a bug. **Radix has no
  calendar primitive**, so `components/date-range-filter.tsx` is a Radix
  Popover holding `react-day-picker` (v10, `mode="range"`, added for this)
  — the same pairing shadcn uses. Its stylesheet is imported by the
  component and re-skinned in `globals.css` through its `--rdp-*` variables
  under `.date-range-picker .rdp-root` (the extra ancestor beats its own
  `.rdp-root` block whichever sheet lands later); cells are tightened from
  its 44px page-sized default. Every day click applies at once (first =
  from, second = to; the popover stays open), the trigger names the range
  (`Aug 13 – Aug 14`, `From Aug 1`, `Any date`), Clear drops it. **Trap:**
  a hover style on `.rdp-day_button` must exclude `.rdp-selected` days, or
  a range end under the pointer turns into a grey square with an invisible
  white number. Picker Dates ↔ keys convert through the browser's own
  calendar (`getFullYear/Month/Date`), never `toISOString`, which would
  shift the day for anyone east of UTC.

- **The whole row is the link** (`components/run-row.tsx`, a client `<tr>`
  with `onClick`/Enter, `hover:bg-surface-alt`, `cursor-pointer`; Ctrl/⌘-click
  opens a new tab, a click that made a text selection is ignored). Started
  used to be an accent link and the rest of the row dead space; now no cell
  is a link. A row can't be an `<a>` and a stretched link needs
  `position: relative` on the `<tr>`, which table rows don't reliably
  honour — hence the handler. The row is `tabIndex=0`; a key press whose
  target isn't the row itself (the focusable failed pill inside it) is left
  alone.
- **Started** renders through `components/local-time.tsx`
  — the viewer's own zone, `Aug 15, 2026, 21:49` (`en-US` like every other
  label, `hourCycle: "h23"` for the app's 24-hour clock;
  `formatLocalRunTime` in `lib/run-timestamp.ts`). **The zone reaches the
  server in a cookie**: a `beforeInteractive` script in the root layout
  (twin of the theme one) writes `vrt-tz=<IANA zone>` on every load, the
  layout reads it (`lib/time-zone.ts` validates — a cookie is user input —
  and `TimeZoneProvider` hands it down), and the server renders local time
  straight away. `LocalTime` still goes through `useSyncExternalStore` with
  a server snapshot (cookie zone) and a client snapshot (browser zone), but
  once the cookie exists those are the same string and hydration has
  nothing to swap. **Trap:** the first version had no cookie — server UTC,
  client swap — and every reload visibly flashed `2026-08-15 19:42:46 UTC`
  → `Aug 15, 2026, 22:42`. Now only a fresh browser's very first request
  (no cookie yet) does that, once. **Every run timestamp goes through it** —
  the run page heading and crumb,
  the comparison-page crumb, the `/projects` Recent runs sidebar — so a link's
  label and the heading it opens never disagree by a time zone. `Breadcrumbs`
  takes a `ReactNode` label for exactly this.
- **Trigger** is `runs.trigger` through `components/run-trigger.tsx` — icon +
  word, each trigger in its own hue (pointer click *manual* in the accent —
  the user's own action, the Run button's colour; clock *scheduled* in
  `info` blue; bolt *webhook* in `warning` amber; labels and classes in
  `lib/run-trigger-display.ts`), so hand-started and automatic runs tell
  apart at a glance. Deliberately none of success/danger: those mean
  outcomes, a trigger is not a verdict — and the icon + word carry the
  meaning without the colour. The `warning` token (`--warning` /
  `--warning-soft`, light and dark) was added for this: the palette had
  only accent, info and the two outcome hues, one short of three neutral
  tells. **Trap (again):** a new colour in `tailwind.config.ts` needs
  `.next` cleared before a dev restart, or `text-warning` silently never
  generates — `--warning` hot-reloads from `globals.css` while the utility
  is missing, which is exactly how it presented. The Recent runs sidebar
  uses the same component.
- **Duration** is `finished_at − started_at` (`lib/run-duration.ts`): `42s`,
  `5m 12s` from a minute up. A dash while queued/running, and for a run that
  failed at enqueue time (finished but never started).
- **Captures** is `captured/attempted` from `lib/run-capture-counts.ts`
  (`4/12`), the whole fraction red and bold when any pair the worker tried
  didn't capture — the shortfall is the point, not the number. It replaced a
  "4/12 captures failed" note squeezed in beside the pill. A dash while in
  flight and for a run that never got to capture (worker crashed first, or a
  run from before `capture_failures` existed — those legacy rows count only
  what did capture, so a `3/3` there is not a lie, just incomplete). The
  Recent runs sidebar keeps the note form: it has no columns.
- **Passed / Failed / New** are comparison counts from
  `lib/run-comparison-counts.ts` — one grouped `comparisons ⋈ shots` query for
  the whole list, same batching rule as capture counts and project cards.
  Approved counts as passed (approving is how a failed diff is accepted);
  `new` is a first capture that became the baseline. Zero is faint, a nonzero
  failed count is the row's only loud figure (`text-danger` bold); a run still
  in flight shows dashes rather than zeros that are about to change.
- **Status is the run's *outcome*, not `runs.status`.** The first version
  showed the raw status, and a `done` run with a red `4` in Failed wore a
  green `done` pill — two contradictory verdicts in one row. `runs.status`
  only says whether the worker got through; `lib/run-outcome.ts` folds it
  together with the comparisons into one of `queued | running | passed |
  failed`: `failed` when the worker errored, some captures failed, *or* any
  comparison came back `failed` (an approved diff no longer counts, so
  approving flips the run to `passed`); `passed` only when nothing failed.
  That one function also drives the `/projects` outcome filter
  (`classifyProjectOutcome`) and the runs timeline (`bucketRunHistory`),
  which each used to spell the rule out again. `.pill-done` is gone from `globals.css` — nothing renders
  the raw status any more.
- **`components/run-outcome-pill.tsx`** is the one run pill everywhere (this
  table, the sidebar, project cards, run page). Its callers all need the
  failed-comparison fact: the table and the sidebar read it from
  `getComparisonCounts`, the project card from `lastResult` (the newest run,
  when finished, *is* the newest finished run), the run page from its own
  rows. A `queued`/`running` run swaps the `::before` status dot for a
  `SpinnerIcon` (`pill-busy` in `globals.css` suppresses the dot;
  `motion-safe:animate-spin`) so an in-flight run reads as in flight without
  a legend.
- **A `failed` pill carries a Radix tooltip saying why** — the pill alone
  can't tell "4 diffs failed" from "the worker crashed". The lines come from
  `lib/run-failure-details.ts` (`describeRunFailure`): failed comparisons
  first, then the worker side — "N of M captures failed" from the counts
  when the caller has them, otherwise `runs.error` (which holds that same
  text for a partial capture, and the raw message for a worker-level
  failure — the project card has no capture counts and takes this path).
  `runs.error` is *summarized* for the tooltip (`summarizeError`: ANSI
  escapes stripped, whitespace flattened, cut at 140 chars) because legacy
  runs hold a `; `-joined Playwright blob there; the run page's notice still
  shows it whole. The pill gets `tabIndex=0` only when it has details, so
  the tooltip opens from the keyboard too. On the project card the pill sits
  `z-10` above the card's stretched link, or the hover would never reach it.
- Eight columns don't fit a phone: the table has a `min-w-[46rem]`
  (`runs-table.tsx`) and scrolls inside its panel (`overflow-x-auto`) rather
  than widening the page. **Adding a column means raising that `min-w`**, or
  the new column squeezes the others instead of triggering the scroll.

## Run results grid

Every shot is a `fullPage` capture, so a run's result cards would otherwise be
as tall as the pages themselves — one card per screen. Each card is a
fixed-height (`h-44`) `object-cover object-top` crop instead: uniform cards in
a three-column grid, with the page label and status pill under the preview.
The full image belongs to the comparison viewer, not to this overview. The
crop scales to the card's width, so a 375px mobile capture legitimately looks
"closer" than a 1200px desktop one. The crop carries the same slight
`bg-black/15` scrim as the project card's preview (2026-08-16): most sites
are white on a white card, and without it the shot read as if it continued
into the "desktop 1440px · passed" row. (A matted picture-frame variant —
crop with its own border on a `surface-alt` mount — was tried and rejected
the same day as too heavy; the scrim is the deliberate choice.)

**The grid is grouped by page** (2026-08-16): one `<section>` per page in
label order (a page's every viewport side by side is how you review one
page — the first cut grouped by viewport and was reversed the same day),
each headed by the page label, its path in faint mono, a muted "N viewports
· X failed · Y not captured" summary (zero parts omitted) and the group's
"Approve N" button. The heading names the page, so **each card's title row
is its viewport** — `ViewportChip` (`components/viewport-chip.tsx`, kind
icon · label · width) in its `plain` form: running text, no pill chrome
(two pills on one row read as two statuses; the diff pill is the only one)
and no `custom` tag, a configuration fact that beside a diff result is only
noise and, as a bordered chip, made chip + pill overflow a three-column
card. The label truncates before it can push the pill out. Cards inside a group order
widest first (Desktop → Tablet → Mobile, the preset order, label as
tiebreaker). Grouping is a single pass over the sorted grid (`groupRunGrid`
in the run page's `data.ts`) because `compareGridOrder` sorts page-first —
by label *then id*, so two pages sharing a label still form two groups
instead of interleaving; that same order drives the comparison viewer's
prev/next, so walking Next from a page's last viewport lands on the next
page's first, exactly as the grid reads. A card whose page row was deleted
falls into one trailing "Deleted page" group with no approve button (its
pair no longer exists to hold a baseline).

**Approve all**: `components/approve-all-dialog.tsx`, rendered twice — a
quiet "Approve N" in every group heading (`pageId` narrows it) and a
primary "Approve all" in a footer under the grid, next to "N comparisons
pending" (below, not in the header: it's the action after reviewing
everything above, and a count on the button would repeat the footer text).
Both open the shared `Modal` ("Approve N comparisons?", the whole-run one
listing the pending count per page when more than one has any, capped and
scrollable), then call `approveRunAction({ runId, pageId? })` and report
through a toast — a plain-argument `ActionResult` action like the /settings
ones, since a modal has no form to hand a `FormState` back to. "Pending" is
`PENDING_APPROVAL_STATUSES` (`lib/approve-comparisons.ts`) = `failed` +
`new` — a diff someone must accept, or a pair with no baseline yet.
`passed` is deliberately *not* pending: within threshold means the current
baseline stands and there is nothing to decide, so a fully passed run shows
no approve buttons at all (the first cut counted every not-yet-approved
status and put "Approve 2" on all-green groups, which read as a to-do
that wasn't). The page's `countPending` and the action's query use the one
constant, so the button's promise and the action's effect can't drift. The
buttons are hidden at 0 pending and while the run is still
`queued`/`running` (approving half a grid isn't what "all" says). Single
approve (the comparison page) and bulk share `lib/approve-comparisons.ts`:
one transaction, sequential baseline upserts (a multi-row `INSERT … ON
CONFLICT` would fail on two targets for the same page/viewport pair), one
`UPDATE … IN (…)` for the statuses.
**Known trap:** `CheckIcon` (like `XIcon`) has no intrinsic size — inside a
`.btn` an unsized SVG grabs the width and the label wraps mid-word; always
pass `className="h-4 w-4"`. `TrashIcon`/`PlusIcon` are fixed-size, which is
why the other dialogs never hit it.

**Region summary row** (2026-08-23): a muted one-line row under the
viewport/status header (`formatRegionSummary`, `lib/region-report.ts`),
worst-first — `changed`/`resized`/`moved`/`added`/`removed` counts
joined by `·` — and rendered **only when it is non-null**: `unchanged`
is never counted into it (a card that says "12 unchanged" says nothing),
so a comparison with a report but no notable regions, or none at all
(pre-feature baseline, a scan that failed), shows no row and takes up no
extra card height.

`.landing-grid` (the failure card's placeholder) draws the grid + mask on a
`::before` layer (`position: relative; isolation: isolate` on the element,
`z-index: -1` on the layer), so children are never masked: the `/projects`
empty state's "Add a site to start…" line sat at the bottom of the mask
ellipse and came out nearly invisible when the mask lived on the element
itself (2026-08-16). Content inside a `landing-grid` box is safe.

### Run page header and capture failures

The run page opens with the timestamp heading (`<LocalTime>`, the viewer's
zone — see "Project run table"), the run id under it and the run-outcome pill
(`components/run-outcome-pill.tsx` over `lib/run-outcome.ts` — the same
folded verdict every run list shows, so a run with failed diffs is `failed`
here too) top-right of that row. A run whose *worker status* is `failed`
gets a `danger-soft`
notice under the header: either "N of M captures failed" (partial capture)
or "Run failed" plus the raw `runs.error` (worker-level failure - stalled
retry, missing baseline file, or a run from before capture failures were
structured, whose `error` still holds the old `; `-joined blob).

**A page/viewport pair the worker couldn't capture is a card in the same
grid**, not a line of text: `components/capture-failure-card.tsx` - the same
`h-44` frame with the blueprint-grid placeholder and a camera-off icon, the
title row with the plain viewport marker and a `capture failed` pill (the
page is named by the group heading), then a third row naming the reason:
`CAPTURE_FAILURE_LABEL[kind]` · the stored message, one truncated line. That
row is a Radix **Popover** trigger (never the native `title`) showing the
label, the full message in mono and `CAPTURE_FAILURE_HINT[kind]` - what to
do about it (`lib/capture-failure-display.ts`). Failure cards interleave
with shot cards in the one page → viewport order via
`buildRunGrid` in the run page's `data.ts`; `rows` (shots) stays a separate
list because the comparison viewer's prev/next walks it and must never land
on a failure.

Data comes from the `capture_failures` table (one row per missing pair:
`kind` + human-readable `message`), written by the worker alongside the
`runs.error` count summary; `getRunResultData` resolves pages/viewports for
shots and failures in the same two batched queries. Kinds live in
`CAPTURE_FAILURE_KINDS` (`@vrt/shared`): `not-html` (a PDF/download - the
case that started this: `page.goto` on a PDF reports `net::ERR_ABORTED`
because headless Chromium turns it into a download, so the worker follows
up with a HEAD request to learn the content type), `http-error` (the worker
now fails on 4xx/5xx instead of screenshotting the error page - on a first
run that page would have become the baseline), `unreachable`, `timeout`,
`selector-timeout`, `other`. Playwright's messages are stored ANSI-free and
without the "Call log:" tail (`apps/worker/src/capture-failure.ts`).

The `/projects` Recent runs sidebar shows "3/6 captures failed" under a
`failed` pill (`lib/run-capture-counts.ts`, two grouped count queries for
the visible runs) so a partial capture reads differently from a worker
crash, which has no such note; the project page's run table has a Captures
column (`3/6`) instead, and every failed pill's tooltip spells the reason
out (see "Project run table").

**Known trap (schema change under `next dev`):** `packages/db/src/client.ts`
caches the drizzle instance on `globalThis` so HMR doesn't leak connection
pools - which also means a new table/relation in `schema.ts` is invisible to
the running dev server (`db.query.<newTable>` is `undefined`, "Cannot read
properties of undefined (reading 'findMany')") until `npm run dev` is
restarted. Migrate, then restart.

## Diff viewer

`components/comparison-viewer.tsx` is one client component driving all four
modes (CLAUDE.md §8) off a single shared `{ mode, zoom, pan }` state, so
switching modes preserves the current zoom/pan instead of resetting it.

- **Pan is clamped to the image's own edges**, not left free. `image.
  offsetWidth`/`offsetHeight` — the CSS layout size *before* the `scale()`
  transform, since transforms don't affect layout — times the current zoom
  gives the on-screen size, clamped against the viewport size (side-by-side
  halves the container width for its two-column grid; every other mode uses
  the full width). Re-clamped on every drag step, zoom step, mode switch, and
  image load, not just once.
- **Known trap:** a plain mousedown+drag on an `<img>` triggers the browser's
  own native image drag-and-drop and/or text-selection — both compete with a
  custom pointer-based pan and silently cancel it (`pointercancel`) a few
  pixels into the gesture. `draggable={false}` alone does not fix this
  cross-browser; also needs `select-none` + the `[-webkit-user-drag:none]`
  Tailwind arbitrary property, plus an `onDragStart` handler that calls
  `preventDefault`.
- **Known trap:** the curtain mode's position control started as a native
  `<input type="range">` positioned at the bottom of the *unclipped* image.
  Once the pan container gained `max-h-[80vh]` + `overflow-hidden` (to stop
  wheel-zoom from also scrolling the page on long captures), that control
  became unreachable, not just hard to find — `overflow-hidden` has no
  scrollbar. Fixed with a custom pointer-driven handle pinned to the
  *container's* vertical center (`top-1/2` on a sibling of the tall image,
  not a descendant of it), so it's reachable regardless of capture height.
- **Toolbar, not floating panels**. The zoom panel and the
  onion-opacity slider used to float *over* the capture (top-right /
  top-left of the pan container) and covered exactly the corner of the page
  under review — the site's search icon in the screenshot that prompted the
  redesign. They now sit in a toolbar above the image, inside one `.panel`
  with the mode tabs; only the curtain handle still lives inside the pan
  container, and it is the one control that must still `stopPropagation()`
  on its own `onPointerDown` (otherwise dragging it also arms the pan
  underneath). Anything new that floats over the image needs the same.
- **Modes are one `SelectMenu`** (icon + name per row: `ColumnsIcon`,
  `CurtainIcon`, `LayersIcon`, `DiffIcon` in `icons.tsx`), not `.btn`
  buttons: a filled `btn-primary` for the active mode had the same weight
  as the page's one real CTA ("Approve as baseline") and read as an action,
  and a row of four tabs (the first replacement) wrapped badly under ~400px
  and ate the toolbar's width. Digits `1`–`4` still switch modes; the arrow
  keys belong to the run walk below. Both listeners sit on `window` and
  bail out via `lib/keyboard-shortcuts.ts` (`isPlainKey`, `isEditableTarget`)
  so typing in the jump list's filter or Alt+← never triggers them.
- **Caption strip names the sides.** Above the image, `Baseline · <date of
  the run the baseline shot came from>` and `Current · this run` — split
  into two cells for the split modes (side by side, curtain), one line for
  the stacked ones (onion "under", diff "vs"). Before this nothing on the
  page said which column was which, let alone how old the baseline was. The
  date comes from `baselineRun` in the route's `data.ts` (one extra `runs`
  lookup by `baselineShot.runId`).
- **Curtain: baseline left, current right** — the clipped layer is the
  baseline (`inset(0 <100-pos>% 0 0)`), the full image behind it the current
  shot. It was the other way round, which the caption strip would have
  contradicted; side by side has always been baseline-left.
- **Onion opacity** uses `@radix-ui/react-slider`, styled with the app's own
  design tokens rather than Radix's default look. Its value is a Radix
  Tooltip bubble anchored to the thumb, open while the thumb is hovered
  *or dragged* — controlled by hand, because an uncontrolled Radix tooltip
  closes on pointerdown and would vanish the moment a drag starts; the drag
  flag is released on the next `window` `pointerup`, not the thumb's own (a
  drag let go off the thumb never fires that). It went always-open for a
  while (`fd5a90d`) and back to hover-only in the toolbar redesign — a
  permanent bubble over the toolbar covered the row above it.
  `Tooltip.Provider` lives once in the root `layout.tsx`, not locally in
  the diff viewer, so any tooltip anywhere else in the app can use it
  without its own provider.
- **Toolbar rules**: thin `h-5 w-px bg-border` spans (`ToolbarRule`)
  between the onion group and the zoom group and between the zoom
  buttons — the glyphs otherwise ran together as one string. Icons and
  status dots beside text (mode dropdown, nav links) carry
  `translate-y-px`, the ViewportChip nudge: centred on the line box they
  sit visibly above the text's optical centre.

### Region overlays (2026-08-23)

- **`ShotLayer` wraps every `<img>`** (`region-overlay.tsx`): the pan/zoom
  transform sits on the wrapper, and the wrapper is `w-fit` so the
  overlay's box is exactly the image's box — without it a 375px mobile
  shot got a column-wide SVG, since the wrapper otherwise stretched to the
  grid cell. The overlay itself is an `<svg>` with a `viewBox` in
  screenshot pixels, `preserveAspectRatio="none"` and
  `vector-effect: non-scaling-stroke` on each `<rect>`, so the boxes track
  the image through every zoom/pan/mode change with no maths in the
  component. Diff mode draws over the **shared (min) size** of the two
  captures, not either one's own — the diff image is the top-left crop of
  whichever side is larger, so a region box outside that crop would float
  over nothing.
- **Statuses by colour and dash**, never colour alone (CLAUDE.md §9):
  `changed`/`resized` solid `danger`, `added`/`removed` dashed `warning`,
  `moved` finely dashed `info`, `unchanged` a thin faint `border`. `R` and
  the toolbar toggle both flip `showRegions`; it defaults **on** only when
  the report has at least one entry that isn't `unchanged` — a report of
  nothing but `unchanged` would just hatch the capture for no reason. The
  viewer remounts per comparison on prev/next (the App Router keys the
  segment by `comparisonId`), so this default re-seeds itself on every
  navigation rather than sticking from the comparison you came from.
- **The list under the image** (`region-list.tsx`) is a plain scrollable
  list of the report's entries; clicking one selects it and calls
  `panToRect`, which reuses the same `clampPan` the drag/zoom/wheel
  handlers use, computing screen-px-per-screenshot-px as `image.offsetWidth
  × zoom / shotWidth` — the *side's own* width, since baseline and current
  can differ in width.
- **Known trap:** `ShotLayer`'s wrapper took its position class from a
  `className` prop with `relative` hardcoded as part of the template
  string. Onion mode's current layer passes `absolute left-0 top-0` to
  stack it over the baseline, but Tailwind emits `.relative` *after*
  `.absolute` in its generated stylesheet, so the later rule won by source
  order and the layer computed to `position: relative` — it rendered below
  the baseline in normal flow instead of over it, doubling the panel's
  height and leaving the opacity slider fading an image that overlaid
  nothing. Fixed by letting the caller own the whole position class
  (`className ?? "relative"`), so onion's `absolute` is never fought by a
  hardcoded default.

### Comparison page

- **Rows:** crumbs + title left with the verdict pill (a size up,
  `text-sm px-3 py-1.5`, and the height/width deltas beside it) right; then
  the run walk left and the approve button right. Every row `flex-wrap`s,
  so at phone widths the walk breaks into two lines and the button drops
  under it instead of overflowing. The no-baseline "First capture" panel
  keeps the viewer's panel shape (a `py-2.5 text-sm` header the height of
  the toolbar, the capture capped at `80vh` and scrolling inside).
- **Prev/Next name their destination.** `components/comparison-nav.tsx`:
  `‹ Home @ Tablet` / `Pricing @ Desktop ›` with a status dot in the
  neighbour's verdict colour (`COMPARISON_STATUS_DOT_CLASS`,
  `lib/comparison-status.ts`; the status is also in `sr-only` text — colour
  is never the only carrier), disabled `First` / `Last` stand-ins at the
  ends so the strip keeps its shape instead of losing a button, and `←`/`→`
  as shortcuts. The bare "← Prev / Next →" told the reviewer nothing about
  where they were going or how far the run went.
- **Position + jump list.** Between them a `3 / 12` counter that is a
  `Combobox` (`triggerLabel` + `contentClassName` were added to it for
  exactly this: a compact trigger with a wide list) over every comparison of
  the run in grid order, filterable by page, viewport or status. The walk
  is `siblings` + `index` from the route's `data.ts` — every row of
  `getRunResultData` that has a comparison, i.e. the same list the run page
  lays out — replacing the old `prevComparisonId`/`nextComparisonId` pair.
  `ComparisonSibling` lives in `lib/comparison-walk.ts` (plain module) so
  the client component doesn't import the route's `data.ts`, which touches
  `@vrt/db`.
- **Approve, then move on.** `approveComparisonAction` redirects to the
  run's next *pending* comparison (`nextPendingComparisonId`: forward first,
  then wrapping to anything left behind; `failed`/`new` per
  `PENDING_APPROVAL_STATUSES`) and stays put when nothing is left. The
  target is resolved server-side from the walk after the approval — never a
  client-supplied href. The button's weight follows what there is to decide:
  `btn-primary` for a pending diff, `btn-quiet` for a `passed` pair (the
  baseline already stands; re-pointing it is optional, matching the run
  page, which shows no approve buttons for passed at all), a disabled
  `Approved ✓` outline afterwards.

## Live updates

Files: `app/api/events/route.ts` → `handler.ts` (`createEventStreamResponse`)
is the server end; `lib/live/` holds `broker.ts` (in-process fan-out, one
Redis subscription per web process), `bridge.ts` (`ensureLiveBridge`: one
BullMQ `QueueEvents` subscription, cached on `globalThis` so HMR doesn't
leak, plus the 5 s liveness poll), `source.ts` (reads queue/run state from
Redis + Postgres), `workers.ts` (counts worker heartbeat keys),
`queue-changes.ts` (is a freshly read queue state worth a frame),
`snapshot.ts` (pure state builders), `event-scope.ts` (per-connection
ownership filter), `own-queue.ts`, `prune-runs.ts`, `sse.ts` (wire format
only). The client is `components/live/live-provider.tsx`
(`useLiveQueue` / `useLiveRun`, the 300ms `router.refresh()` debounce),
rendered by `worker-indicator.tsx` (header pill), `worker-status.tsx`
(`/projects` sidebar panel, with the red "Nothing is consuming the queue"
line), `run-progress.tsx` (run page bar) and `queued-run-warning.tsx`
(project page: shown only while a run is queued, the stream is connected
and `workersOnline === 0`, with the `docker compose up -d worker` hint).

**Queue figures are scoped by role.** An admin's worker indicators show the
whole installation's queue; everyone else's show only their own runs.
`queue` frames stay unscoped on the wire - they are also how `workersOnline`
arrives, and `event-scope.ts` deliberately lets them through to everyone - so
the narrowing happens in the client, in `lib/live/own-queue.ts`: the
provider's `runs` map is *already* filtered to the viewer's projects by the
per-connection scope, so counting `queued`/`running` in it needs no extra
query and can never disagree with the run list it came from. The flag itself
(`scopeToOwnRuns`) is server-rendered in the root layout, where
`getOptionalUser()` is already cached from the header's own lookup.

**`workersOnline` is deliberately left global**, even for a non-admin: it
answers "is anything consuming the queue at all", which is the same question
for every viewer - a per-user "worker offline" would mean nothing. The
caveat worth knowing is the snapshot's `limit: 20` on unfinished runs: it is
applied before ownership filtering, so a user's scoped counts can undercount
while more than twenty *other* runs are pending. The next `run` event
corrects it, and no installation this tool targets sits in that state for
long.


`app/api/events/route.ts` serves one process-wide feed over SSE, not
WebSockets. Traffic here is one-way — queue and run state out, nothing
structured ever goes back in — and the App Router has no way to host a
WebSocket server from a Route Handler; that would mean a custom Node server
or a whole extra container for a direction of traffic SSE already covers
with a plain `ReadableStream` Response on the same infrastructure as every
other route.

**Events are a signal, not a data channel.** `components/live/
live-provider.tsx` never rebuilds a list from an event's payload. A `run`
event schedules a debounced `router.refresh()` (~300ms — a finishing run
fires several events back to back, and without the debounce that's several
refreshes in a row), and the existing server components re-render from
Postgres exactly as they already did: the run list and the shot cards. Only three things live in client state — queue counts, worker
liveness, and the progress of whichever run is currently active — because
those are the only pieces that aren't in Postgres at all. One data path
instead of two, and no client-side cache that can quietly disagree with the
server.

**Postgres stays the single source of truth for run status.** A BullMQ
`QueueEvents` callback only says *something happened to job X*; it does not
say what the run should now look like. On every event the web process
re-reads that job's `runs` row and broadcasts what it finds there, rather
than mapping `active → running` / `completed → done` locally — that
second mapping would duplicate the worker's own state machine in a second
place, and the two would drift the first time the worker gains a status the
web process doesn't know about yet.

**Progress lives only in the BullMQ job**, reported via
`job.updateProgress()` — it is never written to Postgres. It is transient
by nature ("which shot, how far along right now") and meaningless once the
run is over; a finished run is described by its shots and comparisons, not
by a leftover progress counter. This is also why the run page's progress
bar reads from the live stream (`useLiveRun`) instead of a value computed
server-side: there is nothing in the database for the server to compute it
from.

**`workersOnline` counts heartbeats, not connections.** It used to be
BullMQ's `getWorkers()`, which reads Redis' `CLIENT LIST`: a worker process
still connected but wedged (stuck in a loop, deadlocked) counted as online,
and ioredis keeps that connection alive on its own. Since 2026-08-23 the
worker refreshes `vrt:worker:<host>:<pid>` every 5 s with a 15 s TTL
(`apps/worker/src/heartbeat.ts`; the constants are shared with the web app
in `packages/shared/src/worker-heartbeat.ts`), and `lib/live/workers.ts`
`SCAN`s those keys through the queue's existing Redis connection — no second
connection per web process. A blocked event loop cannot refresh a key, so
"wedged" now reads as offline; three missed beats is the margin that keeps a
brief native-call stall from making the indicator flap. A graceful shutdown
deletes the key *before* draining the active job, so `docker compose stop
worker` reads as offline at once rather than after the TTL.

**A worker coming back refreshes the page.** `reconcileStuckRuns()` fails a
worker's stranded runs **directly in Postgres** at startup — no BullMQ job is
involved, so no `run` frame is published, and `queue` frames deliberately
don't refresh anything (`live-provider.tsx` only calls `router.refresh()`
when a `run` frame's status changed). An open page therefore kept rendering
`running` for a run the database had already failed, until someone reloaded
it — a stale card sitting right next to a header that said "Offline". Since
2026-08-23 the provider also refreshes when `workersOnline` *increases*
(`workerJoined`, `lib/live/worker-return.ts`): a worker process that just
booted is exactly the thing that reconciles, and a rising count is the only
hint of it the live stream carries. The first frame after mount is a
baseline, never a refresh — the page was just server-rendered from the same
data. The worker-side half of that bug (a run left `running` for ever after
a stalled-job retry) is in worker.md "Stuck runs and stalled retries".

**A TTL running out is a non-event** — Redis announces nothing, and a dead
worker publishes no BullMQ events either, so without a poll the header would
keep saying "Online" until the next page load. `ensureLiveBridge` therefore
re-reads the queue state every 5 s beside the event-driven publishes, which
puts the worst case for going red at TTL + poll (~20 s). Every publish,
polled or event-driven, goes through `hasQueueChanged`
(`lib/live/queue-changes.ts`): an unchanged state is dropped instead of
sent, so an idle installation doesn't wake every open SSE connection every
5 s.

**Known trap:** `createEventStreamResponse` (`app/api/events/handler.ts`)
checks `signal.aborted` first thing — before subscribing to the broker,
which happens synchronously before the first `await`, ahead of the
`ReadableStream` even being constructed — and returns an empty response if
it's already true (a second check follows the snapshot `await`). An `addEventListener("abort", …)` registered *after*
the abort event has already fired never runs — so without this guard, a
request aborted before `start()` gets scheduled would still subscribe to
the broker and arm the keep-alive `setInterval`, and neither would ever be
torn down: a leaked subscriber and a leaked timer for the rest of the
process's life, one pair per connection aborted at that exact moment.

## Scheduling

Files: `components/schedule-fields.tsx` (the project dialog's Schedule
section), `schedule-status.tsx` (the project page's schedule row with the
pause/resume control), `schedule-pill.tsx` (the `/projects` card marker); `lib/schedule-display.ts`
(all copy, pure and framework-free — importable from server and client
alike), `lib/schedule-write.ts` (validation + upsert-or-delete on save),
`lib/schedule-quota.ts` (the batched screen-facing allowance lookup).

- **Off / On is a radio group, not a toggle**, because a third, related
  state — Paused — already exists and lives in a *different* control (the
  project page's Pause button, not the dialog). Two switches that could both
  read "not running", for different reasons, would be worse than one radio
  group that only ever says one thing. It is *drawn* as a segmented control
  (`ScheduleToggle` in `schedule-fields.tsx`): two real radio inputs,
  `sr-only`, inside labels that paint the segments — the inputs keep the
  radio semantics and arrow-key model, the segment shows the focus ring via
  `peer-focus-visible` since the input itself is invisible. One
  `surface-alt` track, the chosen segment raised in `surface` + shadow, the
  other painting nothing — a first cut gave the track its own border and
  `bg` fill on the white panel, and the result read as two adjacent boxes,
  not one control.
- **The cadence is one sentence with two blanks — "Run [6 ▾] times [during
  the day ▾]"** — and the window options are `SCHEDULE_PHRASE`
  (`lib/schedule-display.ts`, exported for this), the same phrases
  `describeSchedule` uses on the project page and the `/projects` tooltip,
  so what the reader picks is literally what they read afterwards. The
  count word pluralises ("Run [1] time a night").
- **Under the sentence, the schedule as a picture: a 24-hour strip**
  (`schedule-day-strip.tsx`, layout from `lib/schedule-strip.ts`), the
  window shaded in `info-soft` and one `info` mark per run — `info` is the
  *scheduled* trigger hue everywhere else (CLAUDE.md §9). Positions come
  from `runTimesFor`, the function `computeNextRunAt` picks occurrences
  with, so the picture can never drift from the schedule. A window that
  wraps midnight (night) is two segments, evening then morning. **Every
  mark carries its own "HH:MM" under it** (`text-muted`); the 00..24 axis
  sits above the track, faint, and only says which way the day runs. At
  one run an hour 24 labels don't fit one line, so `labelRowsFor` deals
  them round-robin over two rows above 8 marks and three above 16 —
  neighbours land on different rows and nothing overlaps, down to the
  dialog's phone width. The strip is `aria-hidden`: the sentence right
  under it lists the same times in words ("At 09:00, 11:00 … in
  Europe/Warsaw"), so nothing is said only by position or colour.
- **The run-count dropdown's options are capped by two different ceilings**
  that can each bind: the window physically holds only so many runs (never
  more than one an hour — `maxRunsPerDay`), and the project's plan allows
  only so many automated runs a day. `schedule-fields.tsx` shows a caption
  under the dropdown, but only when a ceiling actually cut the list short
  (`any` with no plan limit already offers the full 1..24, so nothing is
  said there) — and the caption **names which bound produced it**
  (`windowCeilingText` / `planCeilingText` in `lib/schedule-display.ts`)
  rather than just being short. A dropdown that stops at 10 doesn't tell you
  whether that's the window or the plan; the two are moved by entirely
  different things (a constant vs. an admin's role-limits edit in
  `/settings`), and only one of the two is something the reader's plan could
  change.
- **A schedule saved under a higher plan can outlive it.** If an admin
  lowers `max_automated_runs_per_day` while a schedule sits at the old,
  higher count, reopening the dialog would otherwise render a `SelectMenu`
  value its own options don't contain. `schedule-fields.tsx` clamps the
  draft to the new ceiling and shows a *separate* warning line
  (`runCountReducedText`) naming the count it was reduced from — distinct
  from the ceiling caption above it, because that one explains a limit that
  was always true and this one explains that the reader's own saved choice
  was just moved. Silently clamping without saying so would leave them
  wondering where their count went.
- **The derived run times are spelled out, never left implicit.** The
  dialog's line under the strip ("At 02:00, 06:00 and 22:00, in
  Europe/Warsaw") reads the actual clock times straight off `runTimesFor`
  (`packages/shared/src/schedule.ts`) — the exact function `computeNextRunAt`
  uses to pick the next occurrence — rather than restating them by hand,
  which could drift from what the schedule actually does the next time
  someone tweaks the spreading formula. The zone is named in the same
  sentence because the schedule keeps the zone it was saved in rather than
  following the browser afterwards: "22:00" read in the wrong zone is a
  different schedule, and `schedule-status.tsx` names it again on the
  project page whenever it differs from the viewer's own.
- **The project page's schedule row lives in the configuration card, not
  under the page title** — the last row of the card body, below the
  viewport chips and above the Edit/Delete footer, separated by its own
  top border (`schedule-status.tsx`). The schedule is edited in the same
  dialog as the pages and viewports above it, so it reads as part of the
  configuration the card summarizes; under the `<h1>` it read as a stray
  status line competing with the Run button. The row is always rendered —
  it opens with the same three-state `SchedulePill` (`On` / `Paused` /
  `Off`) the `/projects` card wears, so the two screens name the state
  with one marker, and `schedule === null` reads "Off · No schedule — set
  one in Edit" (the same discoverability argument as the `/projects` pill
  below): the Edit button that sets a schedule up is in the same card, one
  row down. Here the pill carries **no tooltip** (`detail` is optional on
  `SchedulePill`) — the cadence is spelled out right beside it, and the
  text never repeats what the pill says (no "Paused ·" prefix). Text left,
  the one Pause/Resume button right (`flex-wrap`, button `shrink-0` — the
  button wraps under the text at narrow widths rather than being
  squeezed); the skip warning is a second line under the row.
- **Pause is a separate action from Off, on purpose.** Off (in the dialog)
  **deletes** the `project_schedules` row — the cadence itself is gone.
  Pause (`toggleScheduleAction`, one click from the project page) only flips
  `paused`, so the count, window and zone survive being paused for however
  long. Resuming **recomputes `next_run_at` from now** rather than reusing
  the stale value the row was paused with — without that, a schedule paused
  for a week would find itself overdue the instant it resumed and fire
  immediately, exactly the "catch-up" behaviour CLAUDE.md §4 says the design
  avoids.
- **The `/projects` card pill is always rendered, even for a project with no
  schedule at all** — state `"off"`, label "Off" — rather than only
  appearing once someone has already found the dialog. A feature invisible
  until you go looking for it is a feature most people never find; the
  pill's three states (`on` / `paused` / `off`, `describeSchedulePill` in
  `lib/schedule-display.ts`) put the cadence, or its absence, in the same
  glance that already reads the run-outcome pill and the favicon.
  `SchedulePill` (`schedule-pill.tsx`) carries `label` on the pill itself and
  the fuller sentence (cadence plus "next in …", or the paused state) in a
  Radix tooltip — `detail` is an addition, never the only carrier, because
  tooltips don't open on tap and a touch user would otherwise see nothing
  past the one word.
  **The pill shares the card's "N pages · M viewports" row** rather than
  taking a line of its own: the counts line is short, and a lone pill under
  it read as a stray control on an otherwise tidy card. The row is
  `flex-wrap` with the pill `shrink-0`, so an unusually long counts line
  pushes the pill back onto its own line instead of squeezing it. Measured
  at the narrowest card the grid ever produces (256 px of content — a 640 px
  viewport, `sm:grid-cols-2`, `px-6` column, `px-4` card): the longest state
  "Paused" still leaves ~12 px beside "100 pages · 3 viewports", so all
  three states fit on one line in practice.
- **Every date the pill or the status line shows arrives as a finished
  string, computed on the server from request time.** `describeSchedulePill`
  and `ScheduleStatus` both take a `now` that must be the server's request
  `Date`, never a client-side `new Date()` — both pages are `force-dynamic`,
  so request time is the only reference point that can't disagree with what
  the server already rendered. Reading the clock on the client would
  hydrate a different value than the server sent down and briefly flash the
  corrected one in, worst exactly when someone is watching a "next in 2 min"
  label tick toward zero.
- **A skipped occurrence renders in `warning`, never `danger`.** CLAUDE.md
  §9's colour rule reserves `danger` for a run verdict, and a skip is not
  one — nothing was captured, so nothing failed a comparison. The line
  itself only shows while it is still the latest thing that happened
  (`shouldShowSkip` clears it the moment a later run supersedes it) and for
  48 hours after that (`SKIP_VISIBLE_MS`) — long enough to be seen by
  someone who checks in once a day, short enough that a banner nobody is
  going to act on eventually stops being shown at all. A skip line that
  never clears is a skip line nobody reads.
