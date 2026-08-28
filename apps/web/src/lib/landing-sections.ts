// Anchors for the landing sections that are linkable on their own
// (`/about#plans`, `/about#faq`). Plain module on purpose: the FAQ answers
// link to the plans section, and the FAQ is a client component — reading the
// id from `plan-tiers.ts` would drag `@vrt/db`, and with it `postgres`, into
// the browser bundle (§9 trap index).

export const PLANS_SECTION_ID = "plans";
export const FAQ_SECTION_ID = "faq";
