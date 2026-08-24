import { getCountries, getCountryCallingCode, type CountryCode } from "libphonenumber-js";
import { regionalFlag } from "./utils";

export interface CountryEntry {
  code: CountryCode;
  /** Localised name, from the platform's own ICU data. */
  name: string;
  /** `+258`. Present for every country libphonenumber knows. */
  dial: string;
  flag: string;
}

/**
 * The country list, named and sorted for one locale.
 *
 * Extracted from `PhoneInput` once the address form needed the same thing.
 * Names come from `Intl.DisplayNames` rather than a checked-in table, so all
 * eight app languages are covered by the platform and nothing has to be
 * re-translated when a country is renamed. Sorting uses a locale collator — a
 * plain `<` puts "África do Sul" after "Zimbabué" in Portuguese.
 *
 * Callers should build this lazily. It touches ICU for 245 entries, and doing
 * it during a server render risks output that differs from the browser's and
 * mismatches on hydration.
 */
export function buildCountryList(locale: string): CountryEntry[] {
  const display = new Intl.DisplayNames([locale], { type: "region" });
  const collator = new Intl.Collator(locale);
  return getCountries()
    .map((code) => ({
      code,
      name: display.of(code) ?? code,
      dial: `+${getCountryCallingCode(code)}`,
      flag: regionalFlag(code),
    }))
    .sort((a, b) => collator.compare(a.name, b.name));
}

/**
 * The localised name of one country.
 *
 * For the places that show a country they already have — a saved address, a
 * picker's closed trigger — where building all 245 to read one would be
 * absurd. Falls back to the code, because a display name is not worth an
 * exception on a platform with thin ICU data.
 */
export function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}
