// The About page's question-and-answer section — this instance's only help
// text, so every answer has to describe what the app actually does today.
// Content lives here rather than in the component for the same reason
// plan-tiers.ts does: the section is a client component (Radix accordion) and
// a plain data module keeps the copy out of the client-reference graph and in
// one greppable place. Answers are paragraphs of plain text plus an optional
// trailing link, so nothing here needs JSX.

import { GITHUB_REPO_URL } from "./external-links.js";
import { PLANS_SECTION_ID } from "./landing-sections.js";
import { NEW_PROJECT_HREF } from "./query-params.js";

export type FaqLink = {
  label: string;
  href: string;
  /** Leaves the app: rendered as a plain `<a>` opening in a new tab. */
  external?: boolean;
};

export type FaqItem = {
  /** Accordion item value; also part of the DOM id, so keep it kebab-case. */
  id: string;
  question: string;
  /** One paragraph per entry. */
  answer: string[];
  link?: FaqLink;
};

export type FaqGroup = {
  title: string;
  items: FaqItem[];
};

export const FAQ_GROUPS: FaqGroup[] = [
  {
    title: "Getting started",
    items: [
      {
        id: "create-project",
        question: "How do I create a project?",
        answer: [
          "Open Projects and hit New project. A project needs a name and a base URL — the scheme and host everything else hangs off, like https://example.com.",
          "The same dialog is where you list the pages to watch and tick the viewports to capture them at. The first run screenshots all of it, and those first shots become the baselines every later run is measured against.",
        ],
        link: { label: "Create a project", href: NEW_PROJECT_HREF },
      },
      {
        id: "edit-pages",
        question: "How do I add or edit pages?",
        answer: [
          "The pencil on a project card — or on the project's own screen — reopens that dialog. It is the only place pages and viewports are edited after creation.",
          "Each page carries a label (the name you will read in reports) and a path relative to the base URL: / for the home page, /pricing for a subpage. Edits stay local until you press Save, and a page you keep is updated in place, so its shots and its approved baseline survive the edit.",
        ],
      },
      {
        id: "viewports",
        question: "Which viewports can I capture?",
        answer: [
          "Three presets: Desktop at 1200px, Tablet at 768px and Mobile at 375px. Each one gets its own browser context, so a page captured at three widths gives you three independent comparisons.",
          "You never set a height — captures are full-page, top to bottom. Unticking a viewport deletes it along with its screenshots; if one of those shots is still an approved baseline, the save is refused instead, so history is never dropped by accident.",
        ],
      },
      {
        id: "first-run",
        question: "How do I run a check?",
        answer: [
          "Press Run on the project screen. The run goes queued → running → done, and the page follows it live: progress while the worker captures, then the result grid as it lands.",
          "A run that sits in queued forever usually means no worker is connected — the header shows a worker indicator, and a self-hosted stack needs its worker container up alongside the web one.",
        ],
      },
    ],
  },
  {
    title: "Selectors",
    items: [
      {
        id: "wait-selector",
        question: "What is a wait selector?",
        answer: [
          "An optional CSS selector on a page. The capture waits until an element matching it exists before taking the screenshot.",
          "Use it for whatever only appears once the page is genuinely ready — main.loaded, [data-hydrated], the first row of a table fed by an API. It beats waiting for the network to go quiet, which never happens on a site that polls.",
        ],
      },
      {
        id: "mask-selectors",
        question: "What are mask selectors?",
        answer: [
          "A comma-separated list of CSS selectors. Everything matching them is painted over with a solid block at capture time, so those pixels never reach the comparison.",
          "This is the tool for content that legitimately changes on every visit: avatars, view counters, live timestamps, rotating quotes, embedded ads. Mask the element, keep the layout it occupies.",
        ],
      },
      {
        id: "noisy-diffs",
        question: "My run reports diffs but nothing changed. Why?",
        answer: [
          "Almost always one unmasked element that renders differently each visit. Mask it, or add a wait selector if the shot is being taken before the page settles.",
          "The usual suspects are already handled on every run: web fonts are awaited, CSS animations and transitions are zeroed, lazy images are scrolled into loading, the clock and Math.random are frozen to fixed values, the timezone is pinned to UTC, and known analytics, chat and ad hosts are blocked. What is left is site-specific — that is what the two selector fields are for.",
        ],
      },
    ],
  },
  {
    title: "Runs and review",
    items: [
      {
        id: "baseline",
        question: "What is a baseline?",
        answer: [
          "The approved screenshot for one page at one viewport. The first successful capture of that pair becomes the baseline automatically — there is nothing to approve on a brand-new page.",
          "Every later run compares against it, and it only moves when you approve a change.",
        ],
      },
      {
        id: "review-diff",
        question: "How do I review a change?",
        answer: [
          "The run screen groups the results by page, one card per viewport. Open a card for the full viewer.",
          "It has four modes — side by side, a curtain you drag across, an onion skin with an opacity slider, and a red overlay marking the changed pixels. Keys 1 to 4 switch between them, zoom and pan stay synchronized across modes, and the arrow keys walk through the run's other comparisons without going back to the grid.",
        ],
      },
      {
        id: "outcomes",
        question: "What do the run pills mean, and why is a small diff still passed?",
        answer: [
          "A run reads as queued, running, passed or failed. Failed means either a comparison came back over the threshold or the run could not capture something at all — so a red pill above nothing but green cards is pointing at a capture failure, not at pixels.",
          "Even two back-to-back captures of an untouched page differ by a few hundred antialiased pixels. A comparison passes while the changed share of the image stays under the project's threshold (1% by default) and fails above it — that is the check that keeps the tool usable instead of red on every run.",
        ],
      },
      {
        id: "approve",
        question: "What happens when I approve a comparison?",
        answer: [
          "Approving moves the baseline pointer to the new screenshot. Nothing is deleted: the old shot stays on disk, so every page keeps a visual timeline you can walk back through.",
          "Approve one comparison from its viewer, a whole page with its Approve button, or the entire run from the footer. Bulk approval takes every comparison still awaiting a decision — failed ones and brand-new pages — and never touches the ones that passed, because there the baseline already stands.",
        ],
      },
      {
        id: "capture-failures",
        question: "A card says the capture failed. What now?",
        answer: [
          "That page could not be screenshotted at all, so there is no comparison to look at. The card names the reason: an HTTP error, a response that is not HTML (a PDF, a download), an unreachable host, a navigation timeout, or a wait selector that never appeared.",
          "The first three usually mean the path is wrong or the site moved; the last two mean the page needs longer or the selector no longer matches. Fix it in the project dialog and run again.",
        ],
      },
      {
        id: "run-limits",
        question: "Does pressing Run use up my daily limit?",
        answer: [
          "No. Manual runs are unlimited on every plan — you are there watching the result, and a person clicking a button is its own rate limit.",
          "The daily allowance counts automated runs only: the ones a project's own schedule starts, and it is spent per project, so running one project's schedule never eats into another project's allowance.",
        ],
        link: { label: "See the plans", href: `#${PLANS_SECTION_ID}` },
      },
      {
        id: "scheduled-run-skipped",
        question: "What happens if a scheduled run can't start?",
        answer: [
          "Nothing is added to the run history — a run that never happened is not a failed run. The project page shows an amber line naming the reason instead, and the schedule moves on to its next slot.",
          "There are three reasons: the previous run of that project was still going, the project has no pages or viewports to capture yet, or that project's daily automated-run allowance was already spent.",
        ],
      },
      {
        id: "email-notifications",
        question: "Can VRT e-mail me when a run fails?",
        answer: [
          "Yes, for scheduled runs. Tick \"E-mail me when a scheduled run fails\" on the project's Schedule tab and the owner's address gets a message with the reason and a link to the run whenever a scheduled run comes out failed — a visual diff, a page that couldn't be captured, or a worker error.",
          "It is one e-mail per failure, not one per run: while the previous run is still failed you hear nothing more, and approving its diffs (or the site passing again) re-arms the next message. Runs you start by hand never notify — you are already looking at the result.",
        ],
      },
    ],
  },
  {
    title: "Data and limits",
    items: [
      {
        id: "storage",
        question: "Where are the screenshots kept, and for how long?",
        answer: [
          "On this instance's own disk, addressed by the hash of their content — identical captures across runs are stored once — and served back through the app rather than from a public bucket.",
          "Shots are kept for 30 days. After that only the ones still doing a job survive: current baselines, and both sides of a failed comparison, so a recorded regression never loses the image it was measured against.",
        ],
      },
      {
        id: "limits",
        question: "What are my limits?",
        answer: [
          "Projects and pages per project are capped per role on this instance, checked when you create a project or save a page list. Automated runs are capped per project, per day — pressing Run yourself is always free, on every plan.",
          "The plan cards above list the live figures — they read the same rows the checks enforce, so what you see there is what you get.",
        ],
        link: { label: "See the plans", href: `#${PLANS_SECTION_ID}` },
      },
      {
        id: "scheduling",
        question: "Can runs happen on a schedule?",
        answer: [
          "Yes. Turn it on from the project dialog: pick how many times a day and which part of the day — night, day, or any time — and the runs are spread evenly across that window, never more than one an hour.",
          "The project page shows the schedule and when it fires next, with a Pause button that keeps the cadence without deleting it — switching the dialog to Off is what removes it for good.",
        ],
      },
      {
        id: "regions",
        question: "What are the regions on a comparison?",
        answer: [
          "Besides the one percentage for the whole page, the worker reads the page's top-level blocks — header, navigation, sections, footer — from the DOM when it captures, and compares each block of the new shot with the same block of the baseline. The diff viewer draws them over the capture (the R key toggles them) and lists them: changed, resized, moved, added, removed. A block that only slid down because something above it grew is reported as moved, not changed.",
          "The report is information, not the verdict: the comparison's pass or fail still comes from the whole-page percentage and the project's threshold. A comparison has no report when its baseline was captured before regions existed, or when the page could not be scanned — approving a fresh capture as the baseline is all it takes to get one from the next run on.",
        ],
      },
      {
        id: "email-setup",
        question: "How do I set up e-mail?",
        answer: [
          "Three environment variables on the instance: SMTP_URL (nodemailer's URL form, smtp://user:pass@host:587), MAIL_FROM (the From address) and APP_URL (the public address of this app, used for the links — already defaulted for the bundled Docker setup). Set them together: with none of them set the notification toggle simply stays disabled and says so, but with one SMTP variable set and the other missing the project screens stop rendering — in single-user mode every page, since the header carries the account menu — and the server log names the variable you still owe it.",
          "The address e-mails go to is your account's e-mail. In single-user mode, where there is no login, enter it once from the avatar menu — E-mail address… — and use Send test e-mail there or next to the toggle to check the setup.",
        ],
      },
      {
        id: "self-host",
        question: "Can I run this on my own machine?",
        answer: [
          "Yes — that is the point of it. The whole stack is a Docker Compose file: the web app, the Playwright worker, Postgres and Redis. Screenshots land on your disk, no cloud account is involved. Projects and pages have no ceiling there either — but the single local user is an admin, and admins share the Pro plan's daily automated-run allowance, since one worker still runs one Chromium at a time no matter who owns it.",
        ],
        link: { label: "Get the source", href: GITHUB_REPO_URL, external: true },
      },
    ],
  },
];
