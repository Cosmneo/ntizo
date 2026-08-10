import { z } from "zod";
import { defineQuery, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { cityPublicReadModel } from "@ntizo/shared/read-models";
import { MAX_CITY_RESULTS } from "../../app/use-cases/search-cities.projection";

/**
 * PUBLIC city reference data. Queries only, and no context schema — same
 * property as the provider slice: these handlers take no requester at all.
 *
 * A gazetteer is the same for everyone, so there is nothing here that could
 * vary by who is asking, and importing the private context type would be the
 * first step toward quietly making it vary.
 */
export const searchCities = defineQuery({
  input: zodSchema(
    z.object({
      // Exactly two letters. Not merely non-empty: without a country this is a
      // query over 235 000 rows, and the shape of the input is what stops that
      // rather than a check someone has to remember to write.
      country: z.string().trim().length(2),
      // Bounded: anonymous endpoint, and the string ends up in a LIKE pattern.
      query: z.string().trim().max(80).optional(),
      // Optional, not `.default()`. A zod default does not survive the
      // translation to GraphQL — the field still emits as `Int!` and every
      // caller has to send it, which was found by probing the running schema
      // and not by anything that type-checks. The default lives in the
      // projection, next to the clamp that enforces the bound.
      limit: z.number().int().min(1).max(MAX_CITY_RESULTS).optional(),
    }),
  ),
  output: zodSchema(z.array(cityPublicReadModel)),
  docs: { summary: "Cities of a country, for address entry", tags: ["Public"] },
});

export const cityPublicSchema = defineGraphQLSchema({ city: { search: searchCities } });
