import * as React from "react";
import { cn } from "../lib/utils";

/**
 * `sticky bottom-0`, not `fixed` — it stays inside the document's normal
 * flow and inside whatever scroll container the page already has, so it
 * doesn't need a manual height reserved above it to keep the last field
 * from sitting underneath a bar that was never part of the layout.
 *
 * `lead` and `children` are two slots, not one `children` a caller
 * arranges by hand: the left-right split is the one thing every screen
 * that reaches for this bar needs — progress on one side, the action that
 * moves it forward on the other — so it is the component's job, not
 * something re-decided at each call site.
 *
 * The bottom padding adds `env(safe-area-inset-bottom)` on top of a fixed
 * minimum rather than relying on either alone: the constant keeps the bar
 * from looking cramped on a device that reports no inset at all, and the
 * inset keeps its content from sitting behind a mobile browser's home
 * indicator or gesture bar on one that does.
 */
export function StickyActionBar({
  children,
  lead,
}: {
  children: React.ReactNode;
  /** Left-hand slot: progress, a count, a reason. */
  lead?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-10 flex items-center justify-between gap-4",
        "border-t border-[var(--color-border)] bg-[var(--color-background)]",
        "px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
      )}
    >
      <div className="min-w-0 flex-1">{lead}</div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}
