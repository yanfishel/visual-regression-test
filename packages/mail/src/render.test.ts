import { describe, expect, it } from "vitest";
import { renderRunFailedEmail, renderTestEmail } from "./render.js";

const base = {
  projectName: "Marketing site",
  baseUrl: "https://example.com",
  runUrl: "https://vrt.example.com/projects/p1/runs/r1",
  finishedAt: new Date("2026-08-19T01:30:00Z"),
  timeZone: "Europe/Berlin",
  runError: null,
  failedComparisons: 0,
  totalComparisons: 6,
};

describe("renderRunFailedEmail", () => {
  it("names the project in the subject", () => {
    expect(renderRunFailedEmail({ ...base, failedComparisons: 2 }).subject).toBe(
      "[VRT] Marketing site: scheduled run failed",
    );
  });

  it("puts the run link, the project and the local time in both bodies", () => {
    const mail = renderRunFailedEmail({ ...base, failedComparisons: 2 });
    for (const body of [mail.text, mail.html]) {
      expect(body).toContain("https://vrt.example.com/projects/p1/runs/r1");
      expect(body).toContain("Marketing site");
      expect(body).toContain("https://example.com");
      // 01:30 UTC is 03:30 in Berlin in August.
      expect(body).toContain("03:30");
    }
  });

  it("describes failed comparisons alone", () => {
    const { text } = renderRunFailedEmail({ ...base, failedComparisons: 2 });
    expect(text).toContain("2 of 6 comparisons failed");
    expect(text).not.toContain("Run failed:");
  });

  it("describes a run error alone", () => {
    const { text } = renderRunFailedEmail({ ...base, runError: "3 of 6 captures failed" });
    expect(text).toContain("3 of 6 captures failed");
    expect(text).not.toContain("comparisons failed");
  });

  it("lists both when both apply, comparisons first", () => {
    const { text } = renderRunFailedEmail({
      ...base,
      runError: "1 of 6 captures failed",
      failedComparisons: 1,
    });
    expect(text.indexOf("1 of 6 comparisons failed")).toBeLessThan(text.indexOf("1 of 6 captures failed"));
  });

  it("escapes HTML in user-controlled strings", () => {
    const { html } = renderRunFailedEmail({ ...base, projectName: "<b>x</b>", runError: "a & b" });
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).toContain("a &amp; b");
  });

  it("carries the why-and-how-to-stop footer", () => {
    const { text } = renderRunFailedEmail({ ...base, failedComparisons: 1 });
    expect(text).toContain("e-mail notifications are on for this project");
    expect(text).toContain("Schedule tab");
  });
});

describe("renderTestEmail", () => {
  it("names the instance and the address", () => {
    const mail = renderTestEmail({ appUrl: "http://localhost:3000", to: "me@example.com" });
    expect(mail.subject).toBe("[VRT] Test e-mail");
    expect(mail.text).toContain("http://localhost:3000");
    expect(mail.text).toContain("me@example.com");
    expect(mail.html).toContain("http://localhost:3000");
  });
});
