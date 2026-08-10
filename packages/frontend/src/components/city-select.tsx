import * as React from "react";
import { citiesForCountry } from "../lib/countries";
import { cn } from "../lib/utils";

export interface CitySelectProps {
  value: string;
  onChange: (next: string) => void;
  /** ISO 3166-1 alpha-2. Decides which cities are offered, if any. */
  country: string;
  id?: string;
  required?: boolean;
  placeholder?: string;
  /** Names the open/close control for screen readers. */
  toggleLabel?: string;
  className?: string;
}

/**
 * A city field: pick from the country's list, or type your own.
 *
 * A combobox rather than a select, and the distinction is the whole point. A
 * select refuses anything absent from the list, and no curated list of cities
 * survives contact with a real address — Mozambique alone has hundreds of
 * places somebody legitimately lives. The list covers the common case; typing
 * covers every other one.
 *
 * Clicking the field opens the full list unfiltered, so it behaves like the
 * picker it looks like. Typing narrows it. The chevron is not decoration: a
 * bare input gives no sign there is a list behind it, and a list nobody knows
 * about is a list nobody uses.
 *
 * A country with no curated list renders a plain input with no chevron and no
 * popover. That is correct rather than degraded — an empty dropdown would
 * suggest the city does not exist.
 */
export function CitySelect({
  value,
  onChange,
  country,
  id,
  required,
  placeholder,
  toggleLabel,
  className,
}: CitySelectProps) {
  const [open, setOpen] = React.useState(false);
  // Off until the user types. Opening the field shows every city, so it reads
  // as a picker; narrowing only starts once there is a query to narrow by.
  const [filtering, setFiltering] = React.useState(false);
  const [active, setActive] = React.useState(0);

  const rootRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const listId = `${id ?? "city"}-listbox`;

  const cities = React.useMemo(() => citiesForCountry(country), [country]);
  const hasSuggestions = cities.length > 0;

  const suggestions = React.useMemo(() => {
    if (!hasSuggestions) return [];
    const q = filtering ? value.trim().toLowerCase() : "";
    if (!q) return cities;
    return cities.filter((c) => c.toLowerCase().includes(q));
  }, [cities, value, hasSuggestions, filtering]);

  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Start on the city already chosen, so opening a filled field and pressing
  // down moves from where the user is rather than from the top of the list.
  React.useEffect(() => {
    if (!open) return;
    const i = suggestions.findIndex((c) => c.toLowerCase() === value.trim().toLowerCase());
    setActive(i >= 0 ? i : 0);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (!open) return;
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function pick(city: string) {
    onChange(city);
    setOpen(false);
    setFiltering(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!hasSuggestions) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setFiltering(false);
        setOpen(true);
        return;
      }
      setActive((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && open) {
      // Only when the list is open, so Enter still submits the form otherwise.
      const city = suggestions[active];
      if (city) {
        e.preventDefault();
        pick(city);
      }
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    }
  }

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
          autoComplete="address-level2"
          role={hasSuggestions ? "combobox" : undefined}
          aria-expanded={hasSuggestions ? open : undefined}
          aria-controls={hasSuggestions && open ? listId : undefined}
          aria-autocomplete={hasSuggestions ? "list" : undefined}
          onChange={(e) => {
            onChange(e.target.value);
            if (hasSuggestions) {
              setFiltering(true);
              setOpen(true);
            }
          }}
          onFocus={() => {
            if (hasSuggestions) {
              setFiltering(false);
              setOpen(true);
            }
          }}
          onKeyDown={onKeyDown}
          className="type-body h-full min-w-0 flex-1 bg-transparent px-3.5 placeholder:text-[var(--color-muted-foreground)] focus-visible:outline-none"
        />
        {hasSuggestions ? (
          <button
            type="button"
            tabIndex={-1}
            aria-label={toggleLabel}
            // `mousedown`, so the toggle decides the state before the input's
            // focus handler reopens what this click was meant to close.
            onMouseDown={(e) => {
              e.preventDefault();
              setFiltering(false);
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
        ) : null}
      </div>

      {open && suggestions.length > 0 ? (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-[var(--radius-card-sm)] border border-[var(--color-border)] bg-[var(--color-background)] py-1 shadow-md"
        >
          {suggestions.map((city, i) => {
            const chosen = city.toLowerCase() === value.trim().toLowerCase();
            return (
              <li
                key={city}
                role="option"
                aria-selected={chosen}
                onMouseEnter={() => setActive(i)}
                // `mousedown`, so the choice lands before the input's blur
                // tears the popover down under the pointer.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(city);
                }}
                className={cn(
                  "type-body cursor-pointer px-3.5 py-2",
                  i === active && "bg-[var(--color-muted)]",
                  chosen && "font-semibold",
                )}
              >
                {city}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
