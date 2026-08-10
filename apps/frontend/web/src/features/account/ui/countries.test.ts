import { describe, expect, it } from "vitest";
import { COMMON_CITIES, citiesForCountry } from "@ntizo/frontend-ui";

describe("suggested cities", () => {
  it("covers every autonomous region of Portugal", () => {
    // The rule exists because of this gap. A list picked by size had Funchal
    // and no Azores at all, which does not read as "a shortlist" — it reads as
    // the islands not counting.
    const pt = citiesForCountry("PT");
    for (const seat of ["Funchal", "Ponta Delgada", "Angra do Heroísmo", "Horta"]) {
      expect(pt).toContain(seat);
    }
  });

  it("covers every province of Mozambique", () => {
    const mz = citiesForCountry("MZ");
    // One capital per province, plus Maputo city. Missing one hides a whole
    // region of the launch market behind a field that looks authoritative.
    for (const capital of [
      "Maputo",
      "Matola",
      "Xai-Xai",
      "Inhambane",
      "Beira",
      "Chimoio",
      "Tete",
      "Quelimane",
      "Nampula",
      "Pemba",
      "Lichinga",
    ]) {
      expect(mz).toContain(capital);
    }
  });

  it("keeps every list alphabetical and free of repeats", () => {
    // Sorted, so the order needs no defending; deduped, because a name shown
    // twice is a list nobody proofread.
    const collator = new Intl.Collator("pt");
    for (const [country, cities] of Object.entries(COMMON_CITIES)) {
      expect(cities, country).toEqual([...cities].sort(collator.compare));
      expect(new Set(cities).size, country).toBe(cities.length);
    }
  });

  it("treats an unlisted country as having no suggestions", () => {
    expect(citiesForCountry("JP")).toEqual([]);
    expect(citiesForCountry("mz")).toEqual(citiesForCountry("MZ"));
  });
});
