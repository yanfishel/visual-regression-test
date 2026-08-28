import { describe, expect, it } from "vitest";
import { smtpTransportOptions } from "./mailer.js";

// The transport itself is nodemailer's; what is worth asserting is the
// wiring: the URL still expands into host/port/auth *and* the bounded
// timeouts that keep a dead SMTP host from stalling the single worker
// survive beside it (passing the URL as `{ url }` would drop them).
describe("smtpTransportOptions", () => {
  it("expands the SMTP URL and keeps the bounded timeouts", () => {
    expect(smtpTransportOptions("smtps://user:pass@mail.example.com:2525")).toMatchObject({
      host: "mail.example.com",
      port: 2525,
      secure: true,
      auth: { user: "user", pass: "pass" },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    });
  });
});
