import * as React from "react";
import { cn } from "../lib/utils";

// Re-exported so `../section-rail` alone is a complete import surface for
// the two components that appear together everywhere they're used: a rail
// with nothing to show progress toward is half a screen, and a ring with no
// rail under it has nothing to count.
export { ProgressRing } from "./progress-ring";

export type SectionStatus = "done" | "todo" | "error";

export interface RailSection {
  id: string;
  label: string;
  status: SectionStatus;
  /** Counted by the ring and marked in the rail. */
  required: boolean;
  /** A section the user may not jump to yet. */
  locked?: boolean;
}

/**
 * The words behind the status dot and the "Optional" marker. Required, with
 * no default: this kit ships eight locales, and a default is exactly how
 * one of them — English — quietly ends up in the other seven, the same way
 * it already has once elsewhere in this project. Making the caller supply
 * every word means `check-types` catches the call site that forgot, instead
 * of a translator catching it in production.
 */
export interface SectionStatusLabels {
  done: string;
  todo: string;
  error: string;
  optional: string;
}

const STATUS_DOT_CLASS: Record<SectionStatus, string> = {
  done: "bg-[var(--color-success)]",
  todo: "bg-[var(--color-border)]",
  error: "bg-[var(--color-destructive)]",
};

/**
 * The rail renders status; it never decides it. Whether "pricing" is
 * `done` and whether "later" is `locked` arrives on `sections` from the
 * screen that owns the rule — server-side completeness for a service
 * editor, client-side field validation for a wizard. A rail that computed
 * this itself would have to know both rulesets, and grow a third the next
 * time a screen's definition of "done" differs again.
 *
 * A row's status is a coloured dot plus an `sr-only` word, never colour
 * alone: colour carries none of its meaning to a screen reader, to
 * forced-colours mode, or to a page printed in greyscale. The word says the
 * same thing the dot's colour does, so losing either one still leaves the
 * row understandable — a low bar a component should clear on its own,
 * before it depends on the page around it to make up the difference.
 *
 * Required sections carry a marker; optional ones spell out
 * `statusLabels.optional` instead. The two aren't symmetric on purpose — a
 * compact mark is enough for the default case, but "not marked" is not a
 * safe way to say "optional": it reads identically to a marker nobody has
 * gotten to yet, so the word says it plainly rather than leaving it to be
 * inferred from an absence.
 *
 * The status and "optional" words are `statusLabels`, not text this
 * component carries itself — see the doc comment on `SectionStatusLabels`.
 * The kit ships no copy of its own; this is that rule applied to the one
 * place a status has to be spelled out in words rather than left as an
 * enum a screen can translate on its own terms.
 *
 * Locking is the native `disabled` attribute rather than an `onClick`
 * guard that quietly no-ops: `disabled` also removes the row from the tab
 * order and is announced as unavailable, both of which a JS-only guard
 * would have to reimplement by hand to match.
 */
export function SectionRail({
  sections,
  currentId,
  onSelect,
  title,
  statusLabels,
}: {
  sections: readonly RailSection[];
  currentId: string;
  onSelect: (id: string) => void;
  /** Heading above the list, e.g. "Required sections". */
  title: string;
  /** Every word the rail renders as text: the three status words and "optional". */
  statusLabels: SectionStatusLabels;
}) {
  const headingId = React.useId();

  return (
    <nav aria-labelledby={headingId}>
      <p
        id={headingId}
        className="type-caption mb-2 font-medium text-[var(--color-muted-foreground)]"
      >
        {title}
      </p>
      <ol role="list" className="flex flex-col gap-1">
        {sections.map((section, index) => {
          const isCurrent = section.id === currentId;
          return (
            <li key={section.id}>
              <button
                type="button"
                disabled={section.locked}
                aria-current={isCurrent ? "step" : undefined}
                onClick={() => onSelect(section.id)}
                className={cn(
                  "type-body-medium flex w-full items-center gap-2 rounded-[var(--radius-field)] px-3 py-2 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2",
                  "disabled:pointer-events-none disabled:opacity-50",
                  isCurrent
                    ? "bg-[color-mix(in_srgb,var(--color-primary)_12%,transparent)] text-[var(--color-primary)]"
                    : "text-[var(--color-foreground)] hover:bg-[var(--color-muted)]",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    STATUS_DOT_CLASS[section.status],
                  )}
                />
                <span className="type-caption shrink-0 text-[var(--color-muted-foreground)]">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">{section.label}</span>
                {section.required ? (
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-primary)]"
                  />
                ) : (
                  <span className="type-caption shrink-0 text-[var(--color-muted-foreground)]">
                    {statusLabels.optional}
                  </span>
                )}
                <span className="sr-only">{statusLabels[section.status]}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
