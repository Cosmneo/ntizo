import { CalendarOff } from "lucide-react";
import { cn } from "@ntizo/frontend-ui";

/**
 * The two shapes the exceptions and closures rails share.
 *
 * Both panels used to print a bold `dd MMM yyyy` where the row's title should
 * be, so the thing a provider was actually looking for — *why* the shop is shut
 * on the 15th — sat underneath in caption grey. The date is the index, not the
 * headline: it belongs in a badge on the left, the way a calendar entry is
 * indexed everywhere else, leaving the row's own line free for the note.
 */

/** `YYYY-MM-DD` split into a day and a month, read as a UTC instant so the browser's own timezone never shifts it. */
export function DateBadge({
  iso,
  locale,
  tone = "neutral",
}: {
  iso: string;
  locale: string;
  tone?: "neutral" | "warning" | "danger";
}) {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const at = new Date(Date.UTC(y, m - 1, d));
  const month = new Intl.DateTimeFormat(locale, { timeZone: "UTC", month: "short" }).format(at);
  const day = new Intl.DateTimeFormat(locale, { timeZone: "UTC", day: "numeric" }).format(at);
  // The full date once, for anyone who cannot see the two halves stacked —
  // "15 Aug" read as two separate items is not a date.
  const spoken = new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(at);

  return (
    <span
      className={cn(
        "grid w-11 shrink-0 justify-items-center rounded-[10px] border py-1",
        tone === "danger"
          ? "border-[color-mix(in_srgb,var(--color-destructive)_28%,transparent)] bg-[color-mix(in_srgb,var(--color-destructive)_9%,transparent)]"
          : tone === "warning"
            ? "border-[color-mix(in_srgb,var(--color-warning)_32%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_13%,transparent)]"
            : "border-[var(--color-border)] bg-[var(--color-muted)]",
      )}
    >
      <span className="sr-only">{spoken}</span>
      <b
        aria-hidden="true"
        className={cn(
          "type-body-medium leading-none font-semibold tabular-nums",
          tone === "danger" ? "text-[var(--color-destructive)]" : "text-[var(--color-foreground)]",
        )}
      >
        {day}
      </b>
      <span
        aria-hidden="true"
        className="type-caption text-[9.5px] tracking-[0.07em] text-[var(--color-muted-foreground)] uppercase"
      >
        {month}
      </span>
    </span>
  );
}

/**
 * A rail section with nothing in it yet.
 *
 * "No exceptions yet." on its own left three quarters of the old left-hand
 * column as grey sentences under headings, which is most of why the page read
 * as unfinished. A dashed tile says the same thing while looking like a place
 * something goes.
 */
export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid justify-items-center gap-1.5 rounded-[var(--radius-card-sm)] border border-dashed border-[color-mix(in_srgb,var(--color-foreground)_16%,transparent)] bg-[var(--color-muted)] px-4 py-5 text-center">
      <CalendarOff aria-hidden="true" className="h-4 w-4 text-[var(--color-muted-foreground)]" />
      <p className="type-caption max-w-[26ch] text-[var(--color-muted-foreground)]">{children}</p>
    </div>
  );
}
