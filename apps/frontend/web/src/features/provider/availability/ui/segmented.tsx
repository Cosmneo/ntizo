import { cn } from "@ntizo/frontend-ui";

/**
 * A pill of mutually exclusive options, with the chosen one raised out of the
 * track.
 *
 * Not `ChoiceChips`, which is the right control for a *set* being picked from
 * — categories, weekdays, booking modes — and reads as a row of independent
 * things. This is one question with one answer, sitting in a context strip
 * beside the thing it changes, so it wants the compact segmented shape rather
 * than a legend and a row of separate chips.
 *
 * A `radiogroup` rather than a set of buttons: it is a single-choice control,
 * and the roving arrow-key behaviour a screen reader offers for one is exactly
 * how this should be operated.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex gap-0.5 rounded-full border border-[var(--color-border)] bg-[var(--color-muted)] p-0.5"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "type-caption cursor-pointer rounded-full px-3.5 py-1.5 whitespace-nowrap transition-colors",
              selected
                ? "bg-[var(--color-background)] font-medium text-[var(--color-foreground)] shadow-[0_1px_2px_rgba(19,23,27,0.05)]"
                : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
