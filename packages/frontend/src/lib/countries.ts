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

/**
 * Common cities per country, for typeahead only.
 *
 * Suggestions, never constraints: the field stays free text, because no
 * curated list survives contact with a real address. Coverage is deliberately
 * launch-shaped — heavy on Mozambique, a little Portugal and South Africa,
 * nothing else. A country with no entry gets a plain input with no popover,
 * which is the correct behaviour rather than a degraded one.
 *
 * Keyed by `string` rather than `CountryCode` on purpose: this is a partial
 * map, and typing the key would make TypeScript demand all 245.
 */
export const COMMON_CITIES: Readonly<Record<string, readonly string[]>> = {
  MZ: [
    "Maputo",
    "Matola",
    "Beira",
    "Nampula",
    "Chimoio",
    "Nacala",
    "Quelimane",
    "Tete",
    "Xai-Xai",
    "Lichinga",
    "Pemba",
    "Inhambane",
    "Maxixe",
    "Gurué",
    "Angoche",
    "Cuamba",
    "Montepuez",
    "Dondo",
    "Manica",
    "Chókwè",
  ],
  PT: [
    "Lisboa",
    "Porto",
    "Braga",
    "Coimbra",
    "Faro",
    "Aveiro",
    "Funchal",
    "Setúbal",
    "Évora",
    "Guimarães",
    "Cascais",
    "Sintra",
    "Vila Nova de Gaia",
    "Almada",
  ],
  ZA: [
    "Johannesburg",
    "Cape Town",
    "Durban",
    "Pretoria",
    "Port Elizabeth",
    "Bloemfontein",
    "Nelspruit",
    "Polokwane",
  ],
  BR: [
    "São Paulo",
    "Rio de Janeiro",
    "Brasília",
    "Salvador",
    "Fortaleza",
    "Belo Horizonte",
    "Curitiba",
    "Recife",
    "Porto Alegre",
  ],
};

export function citiesForCountry(country: string): readonly string[] {
  return COMMON_CITIES[country.toUpperCase()] ?? [];
}
