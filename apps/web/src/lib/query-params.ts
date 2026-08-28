// Plain module, deliberately not part of a "use client" file: every export of
// a client module turns into a client reference when a server component
// imports it, so the constant would not be a string on the server.
export const NEW_PROJECT_QUERY_PARAM = "new";

// Links point here instead of opening the dialog directly, so server
// components can offer "New project" without a dialog context.
export const NEW_PROJECT_HREF = `/projects?${NEW_PROJECT_QUERY_PARAM}=1`;

// /projects list state: search text, outcome filter, page number. Owned by
// the toolbar and pagination links; the server page parses them with
// lib/project-filters.ts.
export const PROJECT_SEARCH_QUERY_PARAM = "q";
export const PROJECT_FILTER_QUERY_PARAM = "filter";
export const PROJECT_PAGE_QUERY_PARAM = "page";

// Admin-only: whose projects the list shows. Absent means the viewing admin
// (see lib/project-owners.ts); a regular user's list ignores it entirely.
export const PROJECT_OWNER_QUERY_PARAM = "owner";

// The "every owner" value for that param. It lives here rather than beside
// the query in lib/project-owners.ts because the client filter needs it, and
// that module imports @vrt/db - which would drag `postgres` (and its `net`
// import) into the browser bundle.
export const ALL_OWNERS_VALUE = "all";

// Project page run table: outcome filter (`failed`/`passed`, absent = all),
// date range (YYYY-MM-DD, either side optional, viewer's calendar days -
// lib/run-date-range.ts) and page number. Named apart from the /projects
// list params like the /settings ones below.
export const RUN_FILTER_QUERY_PARAM = "outcome";
export const RUN_FROM_QUERY_PARAM = "from";
export const RUN_TO_QUERY_PARAM = "to";
export const RUN_PAGE_QUERY_PARAM = "rpage";

// /settings state: active tab plus the user table's search and page. The
// list params are named apart from the /projects ones (`q`/`page`) so a link
// carrying both never has one screen read the other's value.
export const SETTINGS_TAB_QUERY_PARAM = "tab";
export const USER_SEARCH_QUERY_PARAM = "uq";
export const USER_ROLE_QUERY_PARAM = "urole";
export const USER_PAGE_QUERY_PARAM = "upage";

export const SIGN_IN_QUERY_PARAM = "sign-in";

// There is no /sign-in page: auth happens in Clerk's modal. Anything that
// needs to send a signed-out visitor to sign in (middleware, getCurrentUser)
// points at the landing page with this param, which auto-opens the modal.
export const SIGN_IN_HREF = `/?${SIGN_IN_QUERY_PARAM}=1`;
