import { z } from "zod";
import { defineQuery, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { localeSchema, providerTypeSchema } from "@ntizo/shared";
import { providerPageReadModel, providerPublicDetailReadModel } from "@ntizo/shared/read-models";
import { MAX_PUBLIC_PAGE_SIZE } from "../../app/use-cases/list-public-providers.projection";

/**
 * PUBLIC (anonymous) provider surface. Queries only.
 *
 * Note there is no context schema here, unlike the read/write slices. The
 * private tiers bind `ntizoGraphqlContextSchema` because their arg-mappers read
 * a requester off it. These handlers take no requester at all — that is the
 * property, and importing the private context type would be the first step
 * toward quietly reintroducing one.
 */
export const listPublicProviders = defineQuery({
  input: zodSchema(
    z.object({
      // Optional, not `.default()`: a zod default does not survive into the
      // GraphQL schema — the field still emits as `Int!` and every caller has
      // to send it. The real defaults live in the handler and the projection.
      limit: z.number().int().min(1).max(MAX_PUBLIC_PAGE_SIZE).optional(),
      offset: z.number().int().min(0).optional(),
      /** Which language the category names on each card come back in. */
      locale: localeSchema.optional(),
      // Bounded length: this is an anonymous endpoint, and the string ends up
      // in a LIKE pattern.
      search: z.string().trim().max(100).optional(),
      city: z.string().trim().max(120).optional(),
      type: providerTypeSchema.optional(),
      categoryCode: z.string().trim().min(1).max(60).optional(),
      // Minor units, and bounded: a price filter is a pair of numbers a person
      // typed. The cap is far above any real service and exists so a pasted
      // value cannot become a scan of the whole table. Mirrors `listServices`.
      minPriceMinor: z.number().int().min(0).max(1_000_000_000).optional(),
      maxPriceMinor: z.number().int().min(0).max(1_000_000_000).optional(),
      /** A star threshold a person can actually pick, not an arbitrary decimal. */
      minRating: z.union([z.literal(3), z.literal(4), z.literal(4.5)]).optional(),
      verifiedOnly: z.boolean().optional(),
      sort: z.enum(["relevance", "rating", "reviews", "price", "name"]).optional(),
    }),
  ),
  output: zodSchema(providerPageReadModel),
  docs: { summary: "Active providers, for the public directory", tags: ["Public"] },
});

export const getPublicProvider = defineQuery({
  input: zodSchema(z.object({ slug: z.string().min(1), locale: localeSchema.optional() })),
  output: zodSchema(providerPublicDetailReadModel.nullable()),
  docs: { summary: "A single active provider by slug", tags: ["Public"] },
});

/**
 * The cities that currently have a listed business, with how many.
 *
 * Its own field rather than part of the page, because the options a filter
 * offers must not change as that filter is used: a city list that shrank with
 * each choice would strand somebody who picked one with no way back.
 */
export const listProviderCityFacets = defineQuery({
  input: zodSchema(z.object({})),
  output: zodSchema(z.array(z.object({ city: z.string(), count: z.number().int().min(0) }))),
  docs: { summary: "Cities with at least one listed provider", tags: ["Public"] },
});

export const providerPublicSchema = defineGraphQLSchema({
  provider: {
    list: listPublicProviders,
    bySlug: getPublicProvider,
    cities: listProviderCityFacets,
  },
});
