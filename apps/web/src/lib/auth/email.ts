import { DEFAULT_USER_EMAIL } from "@vrt/shared/constants";

// The none-mode default user is created with the placeholder `local@vrt`
// (provision.ts); until the owner enters an address through the account
// menu, that placeholder means "no e-mail address" - nothing may be sent to
// it and the UI says so instead of pretending.
export function hasRealEmail(user: { email: string }): boolean {
  return user.email !== DEFAULT_USER_EMAIL;
}
