import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { ChevronRightIcon } from "@/components/icons";

export interface BreadcrumbItem {
  /** Usually text; a run crumb is a `<LocalTime>` so it matches the heading. */
  label: ReactNode;
  /** Omitted on the last item - the current page is text, not a link. */
  href?: string;
}

// The full ancestor trail shown on every nested screen, replacing the old
// single "back" links. Sits tight under the header (the app column's top
// padding is deliberately small), with the current page as plain text.
// Styled like the eyebrow line above the /projects heading.
export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 font-mono text-xs uppercase tracking-wider text-text-faint mt-1.5">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <Fragment key={index}>
              {index > 0 && (
                <li aria-hidden className="shrink-0">
                  <ChevronRightIcon className="h-3 w-3" />
                </li>
              )}
              <li className="min-w-0">
                {item.href && !isLast ? (
                  <Link
                    href={item.href}
                    className="block max-w-56 truncate hover:text-accent hover:underline"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="block max-w-72 truncate text-text-muted">
                    {item.label}
                  </span>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
