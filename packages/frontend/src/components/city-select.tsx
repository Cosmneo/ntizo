import * as React from "react";
import { citiesForCountry } from "../lib/countries";
import { cn } from "../lib/utils";

export interface CitySelectProps {
  value: string;
  onChange: (next: string) => void;
  /** ISO 3166-1 alpha-2. Decides which suggestions appear, if any. */
  country: string;
  id?: string;
  required?: boolean;
  placeholder?: string;
  className?: string;
}

const MAX_SUGGESTIONS = 8;

/**
 * A city field with country-aware suggestions.
 *
 * Free text with a popover, not a select. The distinction is the whole point:
 * a select replaces what was typed and refuses anything absent from the list,
 * and no curated list of cities survives contact with a real address —
 * Mozambique alone has hundreds of places somebody legitimately lives. The
 * suggestions speed up the common case and never block the uncommon one.
 *
 * A country with no curated list renders a plain input with no popover at
 * all. That is the correct behaviour, not a degraded one: an empty dropdown
 * would suggest the city does not exist.
 */
export function CitySelect({
  value,
  onChange,
  country,
  id,
  required,
  placeholder,
  className,
}: CitySelectProps) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  const cities = React.useMemo(() => citiesForCountry(country), [country]);
  const hasSuggestions = cities.length > 0;

  const suggestions = React.useMemo(() => {
    if (!hasSuggestions) return [];
    const q = value.trim().toLowerCase();
    if (!q) return cities.slice(0, MAX_SUGGESTIONS);
    return cities.filter((c) => c.toLowerCase().includes(q)).slice(0, MAX_SUGGESTIONS);
  }, [cities, value, hasSuggestions]);

  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <input
        id={id}
        type="text"
        required={required}
        value={value}
        placeholder={placeholder}
        autoComplete="address-level2"
        aria-autocomplete={hasSuggestions ? "list" : undefined}
        onChange={(e) => {
          onChange(e.target.value);
          if (hasSuggestions) setOpen(true);
        }}
        onFocus={() => {
          if (hasSuggestions) setOpen(true);
        }}
        className="type-body h-11 w-full rounded-[var(--radius-field)] border border-[var(--color-input)] bg-[var(--color-background)] px-3.5 placeholder:text-[var(--color-muted-foreground)] focus-visible:border-[var(--color-primary)] focus-visible:outline-none"
      />

      {open && suggestions.length > 0 ? (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-[var(--radius-card-sm)] border border-[var(--color-border)] bg-[var(--color-background)] py-1 shadow-md"
        >
          {suggestions.map((city) => {
            const exact = city.toLowerCase() === value.trim().toLowerCase();
            return (
              <li
                key={city}
                role="option"
                aria-selected={exact}
                // `mousedown`, so the choice lands before the input's blur
                // tears the popover down under the pointer.
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(city);
                  setOpen(false);
                }}
                className={cn(
                  "type-body cursor-pointer px-3.5 py-2 hover:bg-[var(--color-muted)]",
                  exact && "bg-[var(--color-muted)] font-semibold",
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
