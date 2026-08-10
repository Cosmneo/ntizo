import * as React from "react";
import type { CountryCode } from "libphonenumber-js";
import { buildCountryList, countryName } from "../lib/countries";
import { regionalFlag } from "../lib/utils";
import { Select, type SelectOption } from "./select";

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
 * A country picker, on the project's `Select`.
 *
 * All it adds is the list: 245 countries named by `Intl.DisplayNames`, sorted
 * by a locale collator, each with its flag and its ISO code. Everything about
 * how it looks and behaves comes from `Select`, because a country field and a
 * gender field sitting in the same form and looking like different controls is
 * worse than either looking wrong alone.
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

  const options = React.useMemo<SelectOption[]>(() => {
    // Built only while open. 245 ICU lookups are not free, and keeping them
    // off the server render avoids output that differs from the browser's.
    // The closed trigger still needs its label, so the current country is
    // named on its own — one lookup instead of 245.
    if (!open) {
      return value
        ? [
            {
              value,
              label: countryName(value, locale),
              adornment: regionalFlag(value),
            },
          ]
        : [];
    }
    return buildCountryList(locale).map((c) => ({
      value: c.code,
      label: c.name,
      hint: c.code,
      adornment: c.flag,
    }));
  }, [open, locale, value]);

  return (
    <Select
      id={id}
      value={value}
      onChange={(code) => onChange(code as CountryCode)}
      onOpenChange={setOpen}
      options={options}
      searchable
      searchPlaceholder={searchPlaceholder}
      noResultsText={noResultsText}
      ariaLabel={ariaLabel}
      disabled={disabled}
      className={className}
    />
  );
}
