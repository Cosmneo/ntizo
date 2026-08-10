import * as React from "react";
import type { CountryCode } from "libphonenumber-js";
import { buildCountryList, countryName, type CountryEntry } from "../lib/countries";
import { cn, regionalFlag } from "../lib/utils";

export interface CountrySelectProps {
  value: string;
  onChange: (code: CountryCode) => void;
  /** BCP-47 tag used to name and sort the list. */
  locale?: string;
  /** Copy — passed in so this package needs no i18n runtime of its own. */
  searchPlaceholder: string;
  noResultsText: string;
  ariaLabel: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * A searchable country picker, sharing the phone input's list.
 *
 * The same 245 countries, the same localised names, the same collator — the
 * two fields sat side by side in the address form disagreeing about how a
 * country is spelled would be worse than either being wrong alone.
 *
 * Search matches the name or the ISO code, so someone who knows "MZ" does not
 * have to remember whether the interface calls it Mozambique or Moçambique.
 */
export function CountrySelect({
  value,
  onChange,
  locale = "en-US",
  searchPlaceholder,
  noResultsText,
  ariaLabel,
  id,
  disabled,
  className,
}: CountrySelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);

  const rootRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

  // Built only while open. 245 ICU lookups are not free, and keeping them off
  // the server render avoids output that differs from the browser's.
  const countries = React.useMemo(
    () => (open ? buildCountryList(locale) : []),
    [open, locale],
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
    );
  }, [countries, query]);

  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  React.useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  React.useEffect(() => setActive(0), [query]);

  React.useEffect(() => {
    if (!open) return;
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function pick(entry: CountryEntry) {
    onChange(entry.code);
    setOpen(false);
    setQuery("");
  }

  function onSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const entry = filtered[active];
      if (entry) pick(entry);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  // Named without opening the list: the trigger shows one country, and
  // building 245 to label it would defeat the deferral above.
  const selectedName = React.useMemo(() => countryName(value, locale), [locale, value]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="type-body flex h-11 w-full items-center gap-2 rounded-[var(--radius-field)] border border-[var(--color-input)] bg-[var(--color-background)] px-3.5 text-left focus-visible:border-[var(--color-primary)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span aria-hidden="true">{regionalFlag(value)}</span>
        <span className="flex-1 truncate">{selectedName}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4 w-4 text-[var(--color-muted-foreground)]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-[var(--radius-card-sm)] border border-[var(--color-border)] bg-[var(--color-background)] shadow-md">
          <input
            ref={searchRef}
            type="text"
            value={query}
            placeholder={searchPlaceholder}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKeyDown}
            className="type-body w-full border-b border-[var(--color-border)] bg-transparent px-3.5 py-2.5 placeholder:text-[var(--color-muted-foreground)] focus-visible:outline-none"
          />
          {filtered.length === 0 ? (
            <p className="type-body px-3.5 py-4 text-center text-[var(--color-muted-foreground)]">
              {noResultsText}
            </p>
          ) : (
            <ul ref={listRef} role="listbox" className="max-h-60 overflow-y-auto py-1">
              {filtered.map((c, i) => (
                <li
                  key={c.code}
                  role="option"
                  aria-selected={c.code === value}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(c)}
                  className={cn(
                    "type-body flex cursor-pointer items-center gap-2 px-3.5 py-2",
                    i === active && "bg-[var(--color-muted)]",
                  )}
                >
                  <span aria-hidden="true">{c.flag}</span>
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="type-caption text-[var(--color-muted-foreground)]">
                    {c.code}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
