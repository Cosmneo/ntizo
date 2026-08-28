import * as React from "react";
import { cn } from "../lib/utils";

export interface CitySelectProps {
  value: string;
  onChange: (next: string) => void;
  /**
   * The cities to offer, already filtered by whoever fetched them.
   *
   * This component does no filtering of its own. It used to hold a list of
   * names written by hand, which is the reason for the comment: a curated list
   * silently drops whole regions, and nothing catches it except somebody from
   * the missing one trying to type their own city. The names now come from a
   * gazetteer, and this component's only job is to show them.
   */
  cities: readonly string[];
  /** True while a fetch is in flight. Only changes the empty state's wording. */
  loading?: boolean;
  id?: string;
  required?: boolean;
  placeholder?: string;
  /** Names the open/close control for screen readers. */
  toggleLabel?: string;
  /** Shown when nothing matches and nothing is loading. */
  noResultsText?: string;
  loadingText?: string;
  className?: string;
  /**
   * Focuses the input as soon as it mounts, opening the list with it — this
   * is what a control that gets swapped into place *after* the click that
   * revealed it needs, since the click that caused the swap already landed on
   * the element being replaced and cannot also focus the one that replaces
   * it. Left off for every field that is on screen from the start, which is
   * every caller but that one.
   */
  autoFocus?: boolean;
}

/**
 * A city field: pick one, or type your own.
 *
 * A combobox rather than a select, and the distinction is the point. A select
 * refuses anything absent from the list, and no list is complete enough for
 * that — not even a gazetteer of 235 000 places, which still has no entry for
 * a settlement too new or too small to have been surveyed. The list covers the
 * common case; typing covers the rest.
 *
 * Clicking the field opens the list, so it behaves like the picker it looks
 * like. The chevron is not decoration: a bare input gives no sign there is a
 * list behind it, and a list nobody knows about is a list nobody uses.
 */
export function CitySelect({
  value,
  onChange,
  cities,
  loading = false,
  id,
  required,
  placeholder,
  toggleLabel,
  noResultsText,
  loadingText,
  className,
  autoFocus,
}: CitySelectProps) {
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);

  const rootRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const listId = `${id ?? "city"}-listbox`;

  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Back to the top whenever the offered set changes. Keeping the old index
  // would leave the highlight on whatever row happens to sit at that position
  // in the new list, which is not the row the user was looking at.
  React.useEffect(() => setActive(0), [cities]);

  React.useEffect(() => {
    if (!open) return;
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function pick(cityName: string) {
    onChange(cityName);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setActive((i) => Math.min(i + 1, cities.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && open) {
      // Only when the list is open, so Enter still submits the form otherwise.
      const cityName = cities[active];
      if (cityName) {
        e.preventDefault();
        pick(cityName);
      }
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    }
  }

  const empty = cities.length === 0;
  const emptyText = loading ? loadingText : noResultsText;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div className="flex h-11 w-full items-center rounded-[var(--radius-field)] border border-[var(--color-input)] bg-[var(--color-background)] focus-within:border-[var(--color-primary)]">
        <input
          ref={inputRef}
          id={id}
          type="text"
          required={required}
          value={value}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="address-level2"
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="type-body h-full min-w-0 flex-1 bg-transparent px-3.5 placeholder:text-[var(--color-muted-foreground)] focus-visible:outline-none"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={toggleLabel}
          // `mousedown`, so the toggle decides the state before the input's
          // focus handler reopens what this click was meant to close.
          onMouseDown={(e) => {
            e.preventDefault();
            setOpen((v) => !v);
            inputRef.current?.focus();
          }}
          className="grid h-full w-10 shrink-0 place-items-center text-[var(--color-muted-foreground)]"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {open ? (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-[var(--radius-card-sm)] border border-[var(--color-border)] bg-[var(--color-background)] py-1 shadow-md"
        >
          {empty ? (
            // Never silently blank. An empty popover with no words in it reads
            // as broken, and the two reasons it can be empty — still loading,
            // nothing matched — call for different patience from the user.
            emptyText ? (
              <li className="type-body px-3.5 py-2 text-[var(--color-muted-foreground)]">
                {emptyText}
              </li>
            ) : null
          ) : (
            cities.map((cityName, i) => {
              const chosen = cityName.toLowerCase() === value.trim().toLowerCase();
              return (
                <li
                  key={cityName}
                  role="option"
                  aria-selected={chosen}
                  onMouseEnter={() => setActive(i)}
                  // `mousedown`, so the choice lands before the input's blur
                  // tears the popover down under the pointer.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(cityName);
                  }}
                  className={cn(
                    "type-body cursor-pointer px-3.5 py-2",
                    i === active && "bg-[var(--color-muted)]",
                    chosen && "font-semibold",
                  )}
                >
                  {cityName}
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
