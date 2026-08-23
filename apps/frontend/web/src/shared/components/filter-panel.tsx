import { ChevronDown } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { cn } from "@ntizo/frontend-ui";

/**
 * The tinted card the browse filters live in, and the collapsible section
 * inside it.
 *
 * Shared by the services browse and the provider directory — the one thing on
 * those two pages that genuinely is the same component, unlike their filter
 * *links*, which are typed against their own routes and their own search
 * models. Sharing this is what stops the two panels drifting into looking like
 * different products.
 *
 * **A card, not a bare column.** Loose on the page, the filters read as a list
 * of headings floating beside the results, and the empty space under a short
 * panel read as a hole rather than as margin. Given a surface of its own, the
 * panel is an object with an edge, and what is left beside it is obviously
 * space.
 *
 * The search box stays *outside* it, above: searching is not narrowing an
 * existing set, it is choosing a different one, and a box inside the filter
 * card would say otherwise.
 */
export function FilterPanelCard({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-muted)] p-4",
        className,
      )}
    >
      <h2 className="type-h3 font-semibold">{title}</h2>
      <div className="grid">{children}</div>
    </div>
  );
}

/**
 * One collapsible group of filters.
 *
 * `<details>`, not React state. It opens and closes with no JavaScript, it is
 * keyboard-operable and announced correctly without a line of ARIA, and the
 * chevron turns on `[open]` in CSS — everything a hand-rolled disclosure would
 * have needed a hook, two handlers and an `aria-expanded` to get right, and
 * would have got wrong on the server-rendered first paint.
 *
 * Open by default: a panel that starts collapsed hides what the reader came to
 * use, and turns one click into two for every filter on the page.
 */
export function FilterSection({
  icon: Icon,
  label,
  hint,
  children,
}: {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  /** A line under the heading, where the label alone would overclaim. */
  hint?: string;
  children: ReactNode;
}) {
  return (
    <details
      open
      className="group/section border-t border-[color-mix(in_srgb,var(--color-foreground)_10%,transparent)] py-3 first:border-t-0 first:pt-1 last:pb-1"
    >
      <summary className="type-caption flex cursor-pointer list-none items-center gap-1.5 font-semibold text-[var(--color-muted-foreground)] [&::-webkit-details-marker]:hidden">
        <Icon className="h-3.5 w-3.5" aria-hidden={true} />
        {label}
        <ChevronDown
          aria-hidden="true"
          className="ml-auto h-4 w-4 transition-transform group-open/section:rotate-180"
        />
      </summary>
      {hint && (
        <p className="type-caption mt-1.5 text-[var(--color-muted-foreground)]">{hint}</p>
      )}
      <div className="mt-2.5">{children}</div>
    </details>
  );
}
