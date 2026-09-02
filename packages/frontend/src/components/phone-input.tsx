import * as React from "react";
import {
  AsYouType,
  getCountryCallingCode,
  isValidPhoneNumber,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";
import { cn, regionalFlag } from "../lib/utils";
import { buildCountryList, type CountryEntry } from "../lib/countries";

export interface PhoneInputProps {
  /** The number in E.164 (`+258841234567`), or `""` while incomplete. */
  value: string;
  onChange: (value: string, meta: { isValid: boolean }) => void;
  /** Pre-selected country. Only used on first render. */
  defaultCountry?: CountryCode;
  /** BCP-47 tag used to name and sort the countries. */
  locale?: string;
  /** Copy — passed in so this package needs no i18n runtime of its own. */
  searchPlaceholder: string;
  noResultsText: string;
  countrySelectLabel: string;
  id?: string;
  name?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  onBlur?: () => void;
  /**
   * Forwarded to the number field itself, so a form that refuses this value
   * can mark it invalid and point at the sentence saying why.
   *
   * They belong on the `<input>` and nowhere else: the wrapper is a plain
   * `div` with no role, and a control's own validity has to be announced on
   * the control. Optional, because a form with no message to point at has
   * nothing to say here.
   */
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

export function PhoneInput({
  value,
  onChange,
  defaultCountry = "MZ",
  locale = "en-US",
  searchPlaceholder,
  noResultsText,
  countrySelectLabel,
  id,
  name,
  placeholder,
  disabled,
  required,
  className,
  onBlur,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: PhoneInputProps) {
  const [country, setCountry] = React.useState<CountryCode>(defaultCountry);
  const [national, setNational] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);

  const rootRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  // What we last handed upward. Lets us tell our own echo apart from a real
  // outside change (a form reset), so typing is never fought by the parent.
  const emitted = React.useRef("");

  // The list is only ever needed while the popover is open, and building it
  // touches ICU. Deferring it also keeps `Intl.DisplayNames` off the server
  // render path, where its output can differ from the browser's and would
  // then mismatch on hydration.
  const countries = React.useMemo(
    () => (open ? buildCountryList(locale) : []),
    [open, locale],
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.dial.includes(q),
    );
  }, [countries, query]);

  // Adopt an externally-set value (form reset, or a saved number loaded in).
  React.useEffect(() => {
    if (value === emitted.current) return;
    const parsed = value ? parsePhoneNumberFromString(value) : undefined;
    if (parsed?.country) {
      setCountry(parsed.country);
      setNational(parsed.nationalNumber);
    } else if (!value) {
      setNational("");
    }
    emitted.current = value;
  }, [value]);

  function emit(nextCountry: CountryCode, nextNational: string) {
    const digits = nextNational.replace(/\D/g, "");
    const e164 = digits ? `+${getCountryCallingCode(nextCountry)}${digits}` : "";
    emitted.current = e164;
    onChange(e164, { isValid: Boolean(e164) && isValidPhoneNumber(e164) });
  }

  function handleNational(raw: string) {
    // Keep only what a phone can contain, then let AsYouType group it. The
    // formatter is fed the national part with an explicit country, so it
    // never re-interprets a leading digit as a country code.
    const digits = raw.replace(/\D/g, "");
    const formatted = new AsYouType(country).input(digits);
    setNational(formatted);
    emit(country, digits);
  }

  function pick(entry: CountryEntry) {
    setCountry(entry.code);
    setOpen(false);
    setQuery("");
    // Re-format what's already typed under the new country's rules.
    const digits = national.replace(/\D/g, "");
    setNational(digits ? new AsYouType(entry.code).input(digits) : "");
    emit(entry.code, digits);
  }

  // Close on an outside click. Pointerdown rather than click, so a press that
  // starts outside dismisses immediately instead of waiting for release.
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

  // Keep the highlighted row inside the scroll viewport during arrow-keying.
  React.useEffect(() => {
    if (!open) return;
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

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

  const dial = `+${getCountryCallingCode(country)}`;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div className="flex h-10 w-full rounded-md border border-[var(--color-input)] bg-[var(--color-background)] focus-within:ring-2 focus-within:ring-[var(--color-ring)]">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          aria-label={countrySelectLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex shrink-0 items-center gap-1.5 rounded-l-md px-3 text-sm hover:bg-[var(--color-muted)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          {/* The ISO code carries the meaning on platforms that render no
              flag emoji, so the control never degrades to a bare arrow. */}
          <span aria-hidden="true">{regionalFlag(country)}</span>
          <span className="text-[var(--color-muted-foreground)]">{dial}</span>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5 text-[var(--color-muted-foreground)]"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        <span className="my-2 w-px bg-[var(--color-border)]" aria-hidden="true" />

        <input
          id={id}
          name={name}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          value={national}
          onBlur={onBlur}
          onChange={(e) => handleNational(e.target.value)}
          className="w-full rounded-r-md bg-transparent px-3 text-sm placeholder:text-[var(--color-muted-foreground)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      {open ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-background)] shadow-md">
          <input
            ref={searchRef}
            type="text"
            value={query}
            placeholder={searchPlaceholder}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKeyDown}
            className="w-full border-b border-[var(--color-border)] bg-transparent px-3 py-2 text-sm placeholder:text-[var(--color-muted-foreground)] focus-visible:outline-none"
          />
          {filtered.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-[var(--color-muted-foreground)]">
              {noResultsText}
            </p>
          ) : (
            <ul ref={listRef} role="listbox" className="max-h-60 overflow-y-auto py-1">
              {filtered.map((c, i) => (
                <li
                  key={c.code}
                  role="option"
                  aria-selected={c.code === country}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(c)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm",
                    i === active && "bg-[var(--color-muted)]",
                  )}
                >
                  <span aria-hidden="true">{c.flag}</span>
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="text-[var(--color-muted-foreground)]">{c.dial}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
