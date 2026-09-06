import type { ReactNode } from "react";

/**
 * A business, as a row.
 *
 * A row rather than the tile a service gets, because a business needs more
 * words than a service: what it is, where it is, what it sells and for how
 * much. Given a tile's width those lines wrap into a paragraph; given a row's
 * they read.
 *
 * Separated from its neighbours by a hairline and nothing else. The design this
 * replaces drew a bordered card with a shadow, which is three separations doing
 * one job.
 */
export function ResultRow({
  media,
  title,
  kind,
  description,
  services,
  side,
}: {
  media: ReactNode;
  /** An `h3` holding the route-typed title link and, when earned, the seal. */
  title: ReactNode;
  kind: ReactNode;
  description: ReactNode;
  /** Up to three service chips and the "+n". */
  services: ReactNode;
  /** Rating, price, and the chevron. */
  side: ReactNode;
}) {
  return (
    <article className="group relative grid gap-7 border-t border-[var(--color-border)] py-6 first:border-t-0 first:pt-1 md:grid-cols-[284px_minmax(0,1fr)_190px]">
      {media}
      <div className="grid min-w-0 content-start gap-1.5 pt-0.5">
        {title}
        {kind}
        {description}
        {services}
      </div>
      {side}
    </article>
  );
}

/** One service the business sells, with what it costs. */
export function ServiceChip({ name, price }: { name: string; price: string }) {
  return (
    <li className="inline-flex items-baseline gap-2 whitespace-nowrap rounded-[8px] bg-[var(--color-muted)] px-2.5 py-1.5 text-[13px]">
      {name}
      <b className="font-bold text-[var(--color-headline)] tabular-nums">{price}</b>
    </li>
  );
}
