// The project's two public addresses, in one place: the footer icons and the
// About page's plan cards both point at them, and a repo move or a new
// contact address must not leave one of the two behind.

export const GITHUB_REPO_URL = "https://github.com/yanfishel/visual-regression-test";
export const CONTACT_EMAIL = "yan.fishel@gmail.com";

/** A `mailto:` with the subject line pre-filled, so replies arrive sorted. */
export function mailtoHref(subject: string): string {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}
