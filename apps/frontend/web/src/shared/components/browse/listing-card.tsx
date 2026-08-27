import type { ReactNode } from "react";

/**
 * The class each page puts on its own title `<Link>`.
 *
 * A class and not a component, because the two pages' links are typed against
 * two different routes — `/services/$id` and `/providers/$slug` — and wrapping
 * them in a shared component would erase the typing that turns a broken link
 * into a build failure.
 *
 * The `::after` spans the card, so the whole surface is the target while the
 * tab order gets a single stop named by the listing. The card itself is
 * deliberately NOT an anchor: an anchor cannot legally contain the CTA or the
 * favourite button, and every browser resolves that nesting by dropping one of
 * them.
 */
export const LISTING_TITLE_LINK_CLASS =
  "after:absolute after:inset-0 after:rounded-[var(--radius-card)] focus-visible:outline-none";

/**
 * One result, on either browse.
 *
 * Three columns from `md` up — picture, what it is, what it costs — and one
 * stacked column on a phone, where the stub turns horizontal underneath the
 * body. See `PriceStub`, whose notches sit on the card's edges and are what
 * make the third column read as a stub rather than as a paragraph pushed right.
 *
 * White on the page's tinted ground. That single relationship is what makes a
 * result an object: before it, white cards sat on a white page separated only
 * by a hairline, and a column of them read as a wireframe.
 *
 * Nothing here stretches. A stretched card puts its slack *inside* itself as a
 * band of white under the last line of text; sized to what it has to say, the
 * space falls between the cards instead. The page's `<ul>` carries
 * `items-start` for the same reason.
 */
export function ListingCard({
  media,
  meta,
  title,
  subtitle,
  description,
  tags,
  action,
  stub,
}: {
  media: ReactNode;
  /** The small line above the title: duration, or kind and place. */
  meta?: ReactNode;
  /** The page's typed `<Link>`, carrying `LISTING_TITLE_LINK_CLASS`. */
  title: ReactNode;
  subtitle?: ReactNode;
  description?: string | undefined;
  tags?: ReactNode;
  /**
   * The CTA, when there is no stub to carry it.
   *
   * A listing with nothing priced has no price rail — see `stub` — and its
   * only remaining action has to live somewhere. At the foot of the body is
   * where it lands, because that is the column that still exists.
   */
  action?: ReactNode;
  /**
   * The price rail. Absent for a listing with no price at all, in which case
   * the card is two columns rather than three: an empty third track is a
   * dashed rule with a hole punched in it and nothing beside it, and 196px of
   * white where a price should be reads as a card that failed to finish
   * loading.
   */
  stub?: ReactNode;
}) {
  return (
    <li
      className={[
        "group relative grid gap-4 rounded-[var(--radius-card)] border border-[var(--color-border)]",
        "bg-[var(--color-background)] p-4 shadow-[var(--shadow-xs)]",
        "transition-[border-color,box-shadow,transform] duration-200",
        "hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--color-primary)_34%,var(--color-border))]",
        "hover:shadow-[var(--shadow-lift)] focus-within:border-[var(--color-primary)]",
        // The stacked card first, the row from `md` up. 238px for the picture
        // and 196px for the stub are measured from the approved mockup; between
        // them the body gets whatever is left and never less than zero —
        // `minmax(0,1fr)`, because a bare `1fr` is `minmax(auto,1fr)` and one
        // long unbroken word would push the stub off the card.
        "md:gap-5",
        stub ? "md:grid-cols-[238px_minmax(0,1fr)_196px]" : "md:grid-cols-[238px_minmax(0,1fr)]",
      ].join(" ")}
    >
      {media}

      <div className="flex min-w-0 flex-col gap-1.5 md:pt-0.5">
        {meta && (
          <p
            data-testid="listing-meta"
            className="type-caption flex flex-wrap items-center gap-x-2 gap-y-1 text-[var(--color-muted-foreground)]"
          >
            {meta}
          </p>
        )}

        {title}

        {subtitle && (
          <p
            data-testid="listing-subtitle"
            className="type-body-medium text-[var(--color-muted-foreground)]"
          >
            {subtitle}
          </p>
        )}

        {description && (
          <p
            data-testid="listing-description"
            className="type-body-medium line-clamp-2 text-[var(--color-muted-foreground)]"
          >
            {description}
          </p>
        )}

        {/* `mt-auto` inside the body column only, which has a floor of its own
            from the picture beside it — this pushes the tags to the bottom of
            an already-sized card rather than stretching the card to fit. */}
        {tags && (
          <p data-testid="listing-tags" className="mt-auto flex flex-wrap gap-1.5 pt-1.5">
            {tags}
          </p>
        )}

        {/* `relative` so it sits above the card's whole-surface title link, for
            the same reason `PriceStub` gives its own action wrapper: a CTA
            underneath that overlay is a button nobody can press. */}
        {action && (
          <div data-testid="listing-action" className="relative pt-2.5">
            {action}
          </div>
        )}
      </div>

      {stub}
    </li>
  );
}

/**
 * One fact about a listing, as a chip.
 *
 * `tone` names what the chip is *for*, not what colour it is: `category` is the
 * trade, `plain` is a neutral fact, `good` is a trust signal the platform
 * itself vouches for. A caller asking for "green" would be deciding a thing
 * this component exists to decide.
 */
export function ListingTag({
  tone = "plain",
  testId,
  children,
}: {
  tone?: "plain" | "category" | "good";
  /**
   * Names one kind of chip apart from the others sharing the row.
   *
   * The provider card caps its trades at three and prints a service count and
   * a verification chip beside them; `listing-tags` holds all of them and
   * cannot say which is which, so the cap could only be asserted by counting
   * the whole row and subtracting.
   */
  testId?: string;
  children: ReactNode;
}) {
  const styles = {
    plain: "bg-[var(--color-surface-raised)] text-[var(--color-muted-foreground)]",
    category:
      "bg-[color-mix(in_srgb,var(--color-primary)_9%,transparent)] font-semibold text-[var(--color-primary)]",
    good: "inline-flex items-center gap-1.5 bg-[color-mix(in_srgb,var(--color-success)_12%,transparent)] font-semibold text-[color-mix(in_srgb,var(--color-success)_78%,var(--color-foreground))]",
  } as const;
  return (
    <span data-testid={testId} className={`type-caption rounded-[7px] px-2.5 py-1 ${styles[tone]}`}>
      {children}
    </span>
  );
}
