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
 * Suggested cities per country, for typeahead only.
 *
 * Suggestions, never constraints: the field stays free text, because no list
 * survives contact with a real address. Which is exactly why the list needs a
 * rule — a country whose list is "the cities somebody thought of" looks broken
 * the moment a user notices their own is missing, and every hand-picked list
 * has that hole somewhere.
 *
 * **The rule: every first-level administrative capital, without exception.**
 * Districts in Portugal, provinces in Mozambique and South Africa, states in
 * Brazil. It is the one cut that cannot silently drop a whole region — an
 * archipelago, a province, an interior state — the way "largest by population"
 * always does. Mozambique, the launch market, also carries its cities above
 * roughly 50 000, where the extra coverage earns its keep.
 *
 * Sorted alphabetically, not by size. A size ranking has to be defended and
 * re-defended; alphabetical is scannable and ranks nobody. Adding a country
 * means applying the rule to it, not adding its famous cities.
 *
 * Everywhere else gets a plain input and free text. That is the correct
 * behaviour rather than a degraded one: an empty dropdown would read as "your
 * city does not exist", and a four-city list of a country reads as a promise
 * we did not keep.
 *
 * Keyed by `string` rather than `CountryCode` on purpose: this is a partial
 * map, and typing the key would make TypeScript demand all 245.
 */
export const COMMON_CITIES: Readonly<Record<string, readonly string[]>> = {
  // The eleven provincial capitals, plus the cities above roughly 50 000.
  MZ: [
    "Angoche",
    "Beira",
    "Chimoio",
    "Chókwè",
    "Cuamba",
    "Dondo",
    "Gurué",
    "Ilha de Moçambique",
    "Inhambane",
    "Lichinga",
    "Manica",
    "Maputo",
    "Matola",
    "Maxixe",
    "Mocuba",
    "Montepuez",
    "Nacala",
    "Nampula",
    "Pemba",
    "Quelimane",
    "Tete",
    "Vilankulo",
    "Xai-Xai",
  ],
  // The eighteen district capitals of the mainland, plus the capitals of the
  // two autonomous regions — Funchal for Madeira, and for the Azores all three
  // seats of the regional government: Ponta Delgada, Angra do Heroísmo, Horta.
  PT: [
    "Angra do Heroísmo",
    "Aveiro",
    "Beja",
    "Braga",
    "Bragança",
    "Castelo Branco",
    "Coimbra",
    "Évora",
    "Faro",
    "Funchal",
    "Guarda",
    "Horta",
    "Leiria",
    "Lisboa",
    "Ponta Delgada",
    "Portalegre",
    "Porto",
    "Santarém",
    "Setúbal",
    "Viana do Castelo",
    "Vila Real",
    "Viseu",
  ],
  // The nine provincial capitals, plus the seats of the eight metropolitan
  // municipalities.
  ZA: [
    "Bhisho",
    "Bloemfontein",
    "Cape Town",
    "Durban",
    "East London",
    "Germiston",
    "Gqeberha",
    "Johannesburg",
    "Kimberley",
    "Mahikeng",
    "Mbombela",
    "Pietermaritzburg",
    "Polokwane",
    "Pretoria",
  ],
  // The twenty-six state capitals, plus Brasília for the Federal District.
  BR: [
    "Aracaju",
    "Belém",
    "Belo Horizonte",
    "Boa Vista",
    "Brasília",
    "Campo Grande",
    "Cuiabá",
    "Curitiba",
    "Florianópolis",
    "Fortaleza",
    "Goiânia",
    "João Pessoa",
    "Macapá",
    "Maceió",
    "Manaus",
    "Natal",
    "Palmas",
    "Porto Alegre",
    "Porto Velho",
    "Recife",
    "Rio Branco",
    "Rio de Janeiro",
    "Salvador",
    "São Luís",
    "São Paulo",
    "Teresina",
    "Vitória",
  ],
};

export function citiesForCountry(country: string): readonly string[] {
  return COMMON_CITIES[country.toUpperCase()] ?? [];
}
