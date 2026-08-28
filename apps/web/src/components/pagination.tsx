import Link from "next/link";

// Link-based pager: page state lives in the URL, so back/forward and reloads
// keep their place. Hidden entirely for a single page.
export function Pagination({
  page,
  pageCount,
  hrefForPage,
  label = "Projects pages",
}: {
  page: number;
  pageCount: number;
  hrefForPage: (page: number) => string;
  /** Names the pager for screen readers when a screen has more than one list. */
  label?: string;
}) {
  if (pageCount <= 1) {
    return null;
  }

  const pages = Array.from({ length: pageCount }, (_, index) => index + 1);
  const stepClass =
    "flex h-8 items-center rounded-sm border border-border px-2.5 text-xs font-semibold text-text-muted hover:bg-surface-alt hover:text-text";
  const disabledStepClass =
    "flex h-8 cursor-not-allowed items-center rounded-sm border border-border px-2.5 text-xs font-semibold text-text-faint opacity-60";

  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-center gap-1.5">
      {page > 1 ? (
        <Link href={hrefForPage(page - 1)} className={stepClass}>
          &larr; Prev
        </Link>
      ) : (
        <span aria-hidden className={disabledStepClass}>
          &larr; Prev
        </span>
      )}

      {pages.map((number) =>
        number === page ? (
          <span
            key={number}
            aria-current="page"
            className="flex h-8 min-w-8 items-center justify-center rounded-sm border border-accent bg-accent-soft px-2 font-mono text-xs font-bold text-accent"
          >
            {number}
          </span>
        ) : (
          <Link
            key={number}
            href={hrefForPage(number)}
            className="flex h-8 min-w-8 items-center justify-center rounded-sm border border-border px-2 font-mono text-xs font-semibold text-text-muted hover:bg-surface-alt hover:text-text"
          >
            {number}
          </Link>
        ),
      )}

      {page < pageCount ? (
        <Link href={hrefForPage(page + 1)} className={stepClass}>
          Next &rarr;
        </Link>
      ) : (
        <span aria-hidden className={disabledStepClass}>
          Next &rarr;
        </span>
      )}
    </nav>
  );
}
