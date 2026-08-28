"use client";

import Link from "next/link";
import * as Accordion from "@radix-ui/react-accordion";
import { ChevronRightIcon } from "@/components/icons";
import { Reveal } from "@/components/landing/reveal";
import { FAQ_GROUPS, type FaqLink } from "@/lib/faq";
import { FAQ_SECTION_ID } from "@/lib/landing-sections";

/**
 * The About page's question-and-answer section, linkable as `/about#faq`.
 * This instance has no separate help screen — these answers are it, which is
 * why the copy lives in `lib/faq.ts` where it can be read and revised without
 * going through the markup.
 *
 * One accordion per group, each `type="single" collapsible`: a reader is
 * following one question at a time, and letting a group hold several open
 * answers turns the section back into the wall of text the accordion exists
 * to avoid. The groups are independent, so a question stays open while
 * another group is opened.
 */
export function FaqSection() {
  return (
    <section id={FAQ_SECTION_ID} className="mx-auto w-full max-w-5xl scroll-mt-24 px-6 pb-24">
      <Reveal className="max-w-2xl">
        <h2 className="text-2xl font-extrabold tracking-tight">FAQ</h2>
        <p className="mt-2 text-text-muted">
          What every field does, what the run results mean, and what happens to your screenshots.
        </p>
      </Reveal>

      {/* Two columns from `md`, matching the feature and plan grids above:
          the section keeps the page's full width, and a group column still
          holds a readable measure for the answers. */}
      <div className="mt-8 grid grid-cols-1 gap-x-4 gap-y-8 md:grid-cols-2">
        {FAQ_GROUPS.map((group, index) => (
          <Reveal key={group.title} delay={index * 0.06}>
            <h3 className="font-mono text-xs uppercase tracking-wider text-text-faint">{group.title}</h3>
            <Accordion.Root type="single" collapsible className="panel mt-3 divide-y divide-border">
              {group.items.map((item) => (
                <Accordion.Item key={item.id} value={item.id}>
                  <Accordion.Header>
                    <Accordion.Trigger className="group flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-bold text-text hover:text-accent">
                      {item.question}
                      {/* The chevron is drawn pointing right; a quarter turn
                          down means open, back to the right means closed. */}
                      <ChevronRightIcon className="h-4 w-4 shrink-0 text-text-faint transition-transform group-data-[state=open]:rotate-90" />
                    </Accordion.Trigger>
                  </Accordion.Header>
                  <Accordion.Content className="accordion-answer">
                    <div className="space-y-3 px-5 pb-5 text-sm text-text-muted">
                      {item.answer.map((paragraph) => (
                        <p key={paragraph}>{paragraph}</p>
                      ))}
                      {item.link ? <AnswerLink link={item.link} /> : null}
                    </div>
                  </Accordion.Content>
                </Accordion.Item>
              ))}
            </Accordion.Root>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/** A quiet text link closing an answer — never a button, so the section keeps
 *  reading as prose and the page's only primary actions stay in the hero and
 *  the closing call to action. */
function AnswerLink({ link }: { link: FaqLink }) {
  const className =
    "inline-flex items-center gap-1 text-sm font-semibold text-accent hover:text-accent-strong";
  const icon = <ChevronRightIcon className="h-3.5 w-3.5" />;

  if (link.external) {
    return (
      <a href={link.href} target="_blank" rel="noopener noreferrer" className={className}>
        {link.label}
        {icon}
      </a>
    );
  }

  return (
    <Link href={link.href} className={className}>
      {link.label}
      {icon}
    </Link>
  );
}
