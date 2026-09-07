import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

/**
 * One heading shape for every section on the page.
 *
 * The title and its line on the left, the way out on the right, aligned on the
 * title's baseline rather than the blurb's last line — a two-line blurb used to
 * drag the link down and put it in a different place in every section.
 *
 * **It only reads as a row when there is room for one.** Below `sm` the link
 * took its own share of a 390px line and left the blurb three words wide, so
 * "Escolha um ofício para ver quem trabalha nele." ran down four ragged lines
 * beside it while the heading above wrapped as well. Stacked, each part gets
 * the full column: title, line, then the way out under them both.
 */
export function SectionHead({
  title,
  blurb,
  more,
}: {
  title: string;
  blurb?: string;
  more?: { label: string; to: string };
}) {
  return (
    <div className="mb-6 flex flex-col items-start gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-5">
      <div>
        <h2 className="font-display text-[27px] font-bold leading-tight tracking-[-0.02em] text-[var(--color-headline)]">
          {title}
        </h2>
        {blurb ? (
          <p className="mt-1 text-[14.5px] text-[var(--color-muted-foreground)]">{blurb}</p>
        ) : null}
      </div>
      {more ? (
        <Link
          to={more.to}
          className="inline-flex shrink-0 items-center gap-1 border-b-[1.5px] border-transparent pb-[3px] text-sm font-semibold text-[var(--color-headline)] hover:border-[var(--color-headline)]"
        >
          {more.label}
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}
