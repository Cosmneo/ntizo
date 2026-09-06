import type { ReactNode } from "react";
import { cn } from "@ntizo/frontend-ui";

/**
 * The width every console page is drawn at.
 *
 * Four different `max-w-*` values were in use across the two zones — 6xl,
 * 5xl, 4xl and none — so walking between two screens changed the measure
 * under you. One value, and one documented exception for screens that are
 * read rather than scanned: a detail body, a settings form.
 *
 * Not adopted by any page in this plan; Phase 5 moves every page onto it and
 * a lint rule keeps ad-hoc widths out afterwards.
 */
export function ConsolePage({
  width = "wide",
  className,
  children,
}: {
  width?: "wide" | "narrow";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-col gap-4",
        width === "narrow" ? "max-w-4xl" : "max-w-6xl",
        className,
      )}
    >
      {children}
    </div>
  );
}
