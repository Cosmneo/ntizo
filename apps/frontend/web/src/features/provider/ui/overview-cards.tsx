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
          <Skeleton className="h-9 w-20" />
        ) : (
          <p className="type-h1 font-semibold tabular-nums">{value}</p>
        )}
        {hint && (
          <p className="type-caption text-[var(--color-muted-foreground)]">{hint}</p>
        )}
        {action}
      </CardContent>
    </Card>
  );
}
