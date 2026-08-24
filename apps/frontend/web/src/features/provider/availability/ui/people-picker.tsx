import { Users } from "lucide-react";
import { cn } from "@ntizo/frontend-ui";

export interface PersonOption {
  readonly value: string;
  readonly name: string;
  /** "owner", "admin", "staff" — already translated by the caller. */
  readonly role: string;
}

/**
 * Whose week this is — one control, with a face on it.
 *
 * The screen this replaces asked the question twice: a `Select` of people in
 * one column decided whose rules were being edited, and a separate pair of
 * chips in the other decided whose week was drawn. Two controls, in two places,
 * for one question, which could disagree with each other.
 *
 * A row of people rather than a `Select`, because for a salon with four staff
 * the whole answer set fits on screen and a dropdown makes somebody open a menu
 * to find out who is even in it. It scrolls sideways instead of wrapping: an
 * organization with a dozen members would otherwise push the week two rows
 * further down the page for everybody who has three.
 *
 * Initials, not colours. This design system has one brand hue and three
 * semantic ones, and spending green on "Beto" is spending the colour that means
 * *success* everywhere else on the platform. The selected person is the only
 * one tinted, which is the one distinction the control actually has to make.
 *
 * A `radiogroup`: one question, one answer, and the roving arrow-key behaviour
 * a screen reader offers for one is exactly how this should be operated.
 */
export function PeoplePicker({
  value,
  onChange,
  people,
  team,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  people: readonly PersonOption[];
  /** The union-of-everyone option, or `null` to leave it off entirely. */
  team: { value: string; label: string; hint: string } | null;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      // `-mx-1 px-1` so a focus ring on the first or last option is not clipped
      // by the scroll container's own edge.
      className="-mx-1 flex max-w-full items-center gap-1 overflow-x-auto px-1 py-0.5"
    >
      {people.map((person) => (
        <Option
          key={person.value}
          selected={person.value === value}
          onSelect={() => onChange(person.value)}
          title={person.name}
          hint={person.role}
          badge={<span aria-hidden="true">{initials(person.name)}</span>}
        />
      ))}

      {team && (
        <Option
          selected={team.value === value}
          onSelect={() => onChange(team.value)}
          title={team.label}
          hint={team.hint}
          badge={<Users aria-hidden="true" className="h-4 w-4" />}
          dashed
        />
      )}
    </div>
  );
}

function Option({
  selected,
  onSelect,
  title,
  hint,
  badge,
  dashed = false,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  hint: string;
  badge: React.ReactNode;
  dashed?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex shrink-0 cursor-pointer items-center gap-2 rounded-[var(--radius-card-sm)] border py-1.5 pr-3 pl-1.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:outline-none",
        selected
          ? "border-[color-mix(in_srgb,var(--color-primary)_28%,transparent)] bg-[color-mix(in_srgb,var(--color-primary)_8%,transparent)]"
          : "border-transparent hover:bg-[var(--color-muted)]",
      )}
    >
      <span
        className={cn(
          "grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold",
          dashed
            ? "border border-dashed border-[var(--color-border)] text-[var(--color-muted-foreground)]"
            : selected
              ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
              : "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]",
        )}
      >
        {badge}
      </span>
      {/* Capped and clipped. A member who signed up without a display name
          falls back to their user id, and 32 characters of it stretched this
          pill across half the strip and pushed the week navigation onto a line
          of its own. */}
      <span className="grid max-w-[9rem] leading-tight">
        <span
          className={cn(
            "type-body-medium truncate",
            selected ? "font-semibold text-[var(--color-primary)]" : "",
          )}
        >
          {title}
        </span>
        <span className="type-caption truncate text-[10.5px] text-[var(--color-muted-foreground)]">
          {hint}
        </span>
      </span>
    </button>
  );
}

/**
 * Up to two initials from a display name.
 *
 * `Intl.Segmenter` rather than `name[0]`: a name beginning with an emoji, an
 * accented letter formed from two code points, or a script outside the BMP
 * would otherwise be cut mid-character and render as a replacement box. Falls
 * back to the first code point where the API is missing, which is no worse than
 * what this replaced.
 */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (words.length === 0) return "?";
  return words.map(firstCharacter).join("").toUpperCase();
}

function firstCharacter(word: string): string {
  if (typeof Intl.Segmenter === "function") {
    const [first] = new Intl.Segmenter().segment(word);
    return first?.segment ?? "";
  }
  return [...word][0] ?? "";
}
