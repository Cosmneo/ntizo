import { index, integer, pgSchema, text } from "drizzle-orm/pg-core";

/**
 * Reference data: rows nobody in the product creates, edits or owns.
 *
 * Its own namespace rather than a table inside a bounded context, because it
 * belongs to no context. Addresses need cities, provider locations will too,
 * and search will after that — putting the table in `ntizo_user` because
 * addresses got there first would make every later reader import from a
 * context it has nothing to do with.
 */
export const referenceSchema = pgSchema("ntizo_reference");

/**
 * Populated places, from the GeoNames `cities500` gazetteer (CC BY 4.0).
 *
 * Loaded by `scripts/seed-cities.ts`, never written by the application. It
 * replaced a list of city names written by hand, which is worth recording
 * because the failure was not the list being short — it was the list having no
 * source. Hand-curation drops whole regions silently: the Azores were missing
 * from Portugal for no reason anyone could state, and nothing could have caught
 * it except a person from Horta trying to type their own city.
 *
 * `cities500` rather than the smaller cuts: places above 500 inhabitants, so
 * Namaacha and Vilankulo are present. 235 206 rows, roughly 31 MB with the
 * indexes — a fraction of the smallest Neon tier, and it buys 246 countries.
 */
export const city = referenceSchema.table(
  "city",
  {
    /** GeoNames id. Theirs, not ours — it makes re-seeding an upsert instead of a reload. */
    geonameId: integer("geoname_id").primaryKey(),

    name: text("name").notNull(),

    /**
     * The name lowercased with its accents folded off — what the prefix search
     * actually matches against.
     *
     * A stored column rather than `ILIKE` on the name, because `ILIKE` cannot
     * use a btree index: measured against this table, a rare prefix in a large
     * country fell back to scanning every city in it (6.3 ms for the United
     * States, and worse on a cold cache). Folding once at seed time turns that
     * into an index range scan, and it costs nothing at query time.
     *
     * It also makes the search accent-blind in the direction users need: "sao
     * luis" finds "São Luís". Nobody produces a circumflex on a phone keyboard
     * to look up the city they live in.
     */
    searchName: text("search_name").notNull(),

    /** ISO 3166-1 alpha-2, matching `address.country`. */
    country: text("country").notNull(),

    /**
     * GeoNames' first-level administrative code — a district in Portugal, a
     * province in Mozambique, a state in Brazil. Kept to disambiguate the
     * repeats: Brazil has several Santa Marias and the list must not show the
     * same word four times with no way to tell them apart.
     */
    admin1: text("admin1"),

    /**
     * Population, or 0 where GeoNames has none.
     *
     * The sort key. Alphabetical would put Angoche above Maputo in a country
     * where most bookings are in Maputo, and a picker whose first row is never
     * the answer is a picker people stop opening.
     */
    population: integer("population").notNull().default(0),
  },
  (table) => [
    // Opening the field with nothing typed: this country's cities, biggest
    // first. The index order answers it outright, so there is no sort.
    index("city_country_population_idx").on(table.country, table.population),

    // The prefix search. Works as a range scan because the database collates
    // as C.UTF-8 and `search_name` is already folded — `LIKE 'ma%'` on a
    // plain btree needs both of those to be true, and neither is obvious.
    index("city_country_search_name_idx").on(table.country, table.searchName),
  ],
);
