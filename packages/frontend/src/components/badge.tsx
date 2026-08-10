import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

/**
 * Status pills — "Activa", "Confirmada", "Cancelada".
 *
 * The tones are semantic, not decorative: each maps to one of the system's
 * status colours, at a tint for the ground and full strength for the text.
 * Deriving both from the same token means a status can never end up with a
 * background from one colour and a label from another.
 *
 * `color-mix` for the tint rather than a second hardcoded hex per tone: eight
 * more values to keep in step with the four they are derived from is eight
 * more chances to drift.
 */
const badgeVariants = cva(
  "type-caption inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium",
  {
    variants: {
      tone: {
        info: "bg-[color-mix(in_srgb,var(--color-primary)_12%,transparent)] text-[var(--color-primary)]",
        success:
          "bg-[color-mix(in_srgb,var(--color-success)_14%,transparent)] text-[var(--color-success)]",
        danger:
          "bg-[color-mix(in_srgb,var(--color-destructive)_12%,transparent)] text-[var(--color-destructive)]",
        warning:
          "bg-[color-mix(in_srgb,var(--color-warning)_18%,transparent)] text-[#8a5a00]",
        neutral: "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, className }))} {...props} />;
}

export { badgeVariants };
