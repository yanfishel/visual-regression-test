// Shared because a client component and a server action say the same thing:
// the toggle and the address dialog render these, sendTestEmailAction throws
// them, and they had already drifted in wording and punctuation.
export const MAIL_NOT_CONFIGURED_MESSAGE =
  "E-mail isn't configured on this instance (SMTP_URL, MAIL_FROM, APP_URL).";

export const ADD_EMAIL_FIRST_MESSAGE = "Add your e-mail address in the account menu first.";
