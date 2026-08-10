import * as React from "react";
import { cn } from "../lib/utils";

/**
 * A styled checkbox built on the native input rather than a custom widget.
 *
 * The native element is kept and merely restyled — `appearance-none` plus a
 * background image for the tick — so keyboard focus, space-to-toggle, form
 * submission, `required` validation and screen-reader semantics all keep
 * working without being reimplemented. A div-with-role="checkbox" has to
 * rebuild every one of those and usually rebuilds some of them wrong.
 */
export function Checkbox({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"input">) {
  return (
    <input
      type="checkbox"
      className={cn(
        "peer h-4 w-4 shrink-0 appearance-none rounded-[4px] border border-[var(--color-border)]",
        "bg-[var(--color-background)] transition-colors",
        "checked:border-[var(--color-primary)] checked:bg-[var(--color-primary)]",
        // The tick is a background image so it can be tinted with the
        // foreground token and needs no extra element to position.
        "checked:bg-[length:12px_12px] checked:bg-center checked:bg-no-repeat",
        "checked:[background-image:url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'/%3E%3C/svg%3E\")]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
