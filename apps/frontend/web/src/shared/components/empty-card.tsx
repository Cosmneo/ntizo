import type { ComponentType, ReactNode } from "react";
import { cn } from "@ntizo/frontend-ui";
import { BrandMark } from "./brand-mark";

/**
 * What every list in the app shows when it has nothing to show.
 *
 * One component rather than one per page, because an empty screen is the first
 * thing a new account sees and fourteen of them drawn fourteen ways is the
 * impression that the app was assembled rather than designed. The brand mark
 * is the constant; the words are what change.
 *
 * The mark alone would say *Ntizo* and never say *what* is missing — it is the
 * same on every screen by definition. So it carries a small badge naming the
 * list it stands in for, and the title says the rest.
 */
export function EmptyCard({
  badge: Badge,
  icon: Icon,
  title,
  body,
  action,
  framed = false,
  compact = false,
  className,
}: {
  /**
   * The glyph badged onto the mark — a calendar for bookings, a wallet for
   * money. Taken as a component rather than an element so the size is decided
   * here: a caller passing `<Calendar className="h-6 w-6" />` would overflow
   * the badge, and every call site would have to remember the same number.
   */
  badge?: ComponentType<{ className?: string }>;
  /**
   * Replaces the mark entirely.
   *
   * For the case where nothing is actually missing — a filter or a search that
   * matched nothing. The rows exist; something is hiding them. Putting the
   * brand on that reads as "this part of Ntizo is empty", which is a claim
   * about the account rather than about the filter, and it is false.
   */
  icon?: ComponentType<{ className?: string }>;
  title: string;
  /** One sentence. Omitted when the title already says everything. */
  body?: string;
  /** Usually a link or a button. Omitted when there is nothing to do yet. */
  action?: ReactNode;
  /**
   * Draws the dashed outline.
   *
   * For a page that is otherwise blank, where the card is the only thing on
   * screen and needs an edge to read as deliberate. Inside a list card the
   * outline would be a second border a few pixels from the first.
   */
  framed?: boolean;
  /** Less height, for a panel that has other content under it. */
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2.5 px-6 text-center",
        compact ? "py-10" : "py-14",
        framed &&
          "rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)]",
        className,
      )}
    >
      <span className="relative mb-1 grid h-16 w-16 place-items-center rounded-full bg-[var(--color-muted)]">
        {Icon ? (
          <Icon className="h-6 w-6 text-[var(--color-muted-foreground)]" />
        ) : (
          <BrandMark className="h-[34px]" />
        )}

        {Badge && !Icon && (
          <span className="absolute -right-1 -bottom-1 grid h-[26px] w-[26px] place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-muted-foreground)]">
            <Badge className="h-3.5 w-3.5" />
          </span>
        )}
      </span>

      <h2 className="type-h3 font-semibold">{title}</h2>

      {body && (
        <p className="type-body max-w-[40ch] text-[var(--color-muted-foreground)]">
          {body}
        </p>
      )}

      {action && <div className="mt-2.5">{action}</div>}
    </div>
  );
}
