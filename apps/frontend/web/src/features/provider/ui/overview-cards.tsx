import type { ReactNode } from "react";
import { Card, CardContent, Skeleton } from "@ntizo/frontend-ui";

/**
 * The uppercase label every card on this page wears, and nothing else — no
 * rule, no accent, no glyph before it.
 */
const CAPTION =
  "type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase";

/**
 * One reading. The value is the point, so it is the only thing at heading
 * size; the hint under it is what the number means, and `action` is a verb —
 * only the card that is a task gets one.
 *
 * The placeholder replaces the value alone rather than the whole card: the
 * label and the hint are known before the number arrives, so blanking them
 * too would make the grid flash four grey rectangles and then four different
 * shapes.
 *
 * The value's size is the one thing here that is a breakpoint. At 390px the
 * two-column track leaves each card 137px inside its border and padding, and
 * the widest thing this component is ever handed is the revenue card's money:
 * `formatMoney` of a seven-figure minor amount in pt-MZ is "99 999,99 MTn",
 * which measures 7.25em in Poppins SemiBold — 203px at `type-h1`'s 28px, and
 * still 159px at 22px. Only 18px, the scale's next step down, fits it (130px),
 * so that is what a phone gets; from `sm` the card is wide enough for the full
 * 28px and the number keeps its presence. The skeleton follows the same step,
 * or the placeholder would be half a line taller than the value that replaces
 * it.
 */
export function StatCard({
  label,
  value,
  hint,
  action,
  loading,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="grid gap-1 p-4">
        <p className={CAPTION}>{label}</p>
        {loading ? (
          <Skeleton className="h-6 w-20 sm:h-9" />
        ) : (
          // `text-[18px] sm:text-[28px]` rather than `type-h2 sm:type-h1`: the
          // type scale lives in a plain `@layer components` block, so Tailwind
          // never generates a `sm:` variant of those class names. `type-h1`
          // still carries the family, the weight and the leading.
          <p className="type-h1 text-[18px] font-semibold tabular-nums sm:text-[28px]">
            {value}
          </p>
        )}
        {hint && (
          <p className="type-caption text-[var(--color-muted-foreground)]">{hint}</p>
        )}
        {action}
      </CardContent>
    </Card>
  );
}
