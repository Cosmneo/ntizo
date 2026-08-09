import { z } from "zod";
import { defineQuery, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { providerPublicReadModel } from "@ntizo/shared/read-models";
import { MAX_PUBLIC_PAGE_SIZE } from "../../app/use-cases/list-public-providers.projection";

/**
 * PUBLIC (anonymous) provider surface. Queries only.
 *
 * Note there is no context schema here, unlike the read/write slices. The
 * private tiers bind `ntizoGraphqlContextSchema` because their arg-mappers
 * read a requester off it. These handlers take no requester at all — that is
 * the property, and importing the private context type would be the first step
 * toward quietly reintroducing one.
 */
export const listPublicProviders = defineQuery({
  input: zodSchema(
    z.object({
      limit: z.number().int().min(1).max(MAX_PUBLIC_PAGE_SIZE).default(20),
      offset: z.number().int().min(0).default(0),
    }),
  ),
  output: zodSchema(z.array(providerPublicReadModel)),
  docs: { summary: "Active providers, for the public directory", tags: ["Public"] },
});

export const getPublicProvider = defineQuery({
  input: zodSchema(z.object({ slug: z.string().min(1) })),
  output: zodSchema(providerPublicReadModel.nullable()),
  docs: { summary: "A single active provider by slug", tags: ["Public"] },
});

export const providerPublicSchema = defineGraphQLSchema({
  provider: { list: listPublicProviders, bySlug: getPublicProvider },
});
