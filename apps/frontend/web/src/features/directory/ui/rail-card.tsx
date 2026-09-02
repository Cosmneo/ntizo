import type { ReactNode } from "react";
import { cn } from "@ntizo/frontend-ui";

/**
 * The shell every card in a detail page's sticky right-hand rail sits in —
 * the booking card, the price card, the trust card. One shape so the rail
 * reads as a stack of related cards rather than a mismatched pile of boxes
 * each component invented its own border and radius for.
 *
 * `flat` drops the shadow for a card that sits directly under another
 * `RailCard` (or otherwise already reads as separated by the border alone),
 * so two stacked cards don't double up on elevation.
 *
 * The gap between `label` and `children` is owned here, not left for each
 * caller to add: this component's whole job is making every card in the
 * rail look like one system, and a label-to-content gap invented separately
 * by `ProviderRail`'s and `RailPriceSummary`'s cards is exactly the kind of
 * mismatch it exists to prevent. `type-caption`'s line-height alone reads as
 * flush against whatever sits under it, so the margin is not optional
 * polish.
 */
export function RailCard({
  label,
  flat = false,
  className,
  children,
}: {
  /** A small caption rendered above the children, e.g. "Payment protection". */
  label?: string;
  flat?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-background)] p-6",
        !flat && "shadow-[var(--shadow-sm)]",
        className,
      )}
    >
      {label && (
        <p className="type-caption mb-3 text-[var(--color-muted-foreground)] uppercase tracking-[0.09em]">
          {label}
        </p>
      )}
      {children}
    </div>
  );
}
