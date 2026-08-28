import Image from "next/image";
import { GITHUB_REPO_URL, mailtoHref } from "@/lib/external-links";
import { FooterAboutLink } from "./footer-about-link";
import { GithubIcon, MailIcon } from "./icons";

export function Footer() {
  return (
    <footer className="border-t border-border bg-surface-alt px-6 py-4">
      <div className="grid grid-cols-1 items-center gap-3 text-center sm:grid-cols-[1fr_auto_1fr] sm:gap-4 sm:text-left">
        <a
          href="https://fishart.co.il"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="fishart.co.il"
          className="justify-self-center sm:justify-self-start"
        >
          <Image
            src="/fishart.png"
            alt="fishart"
            width={90}
            height={21}
            className="h-4 w-auto opacity-90 invert dark:invert-0"
          />
        </a>
        <p className="justify-self-center whitespace-nowrap text-sm text-text-muted">
          VRT © 2026. Made with <span className="text-danger">♥</span> for the web
        </p>
        <div className="flex items-center justify-self-center gap-2.5 sm:justify-self-end">
          {/* The quiet half of the landing page's way back (the avatar
              menu's "About VRT" is the other): "/" is the project list for
              anyone signed in, so the pitch lives at /about. */}
          <FooterAboutLink />
          <a
            href={mailtoHref("Visual Regression Test Feedback")}
            aria-label="Send feedback by email"
            className="flex h-[28px] w-[28px] items-center justify-center rounded-full border border-border text-text-muted transition hover:border-accent hover:text-accent"
          >
            <MailIcon />
          </a>
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View source on GitHub"
            className="flex h-[28px] w-[28px] items-center justify-center rounded-full border border-border text-text-muted transition hover:border-accent hover:text-accent"
          >
            <GithubIcon />
          </a>
        </div>
      </div>
    </footer>
  );
}
