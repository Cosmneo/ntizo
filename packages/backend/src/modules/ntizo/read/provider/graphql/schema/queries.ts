import { z } from "zod";
import { defineQuery, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import {
  providerDetailReadModel,
  providerListItemReadModel,
} from "@ntizo/shared/read-models";
import { ntizoGraphqlContextSchema } from "../../../../graphql/context";

/**
 * READ-side GraphQL schema for the provider BC. Queries ONLY — the
 * read=queries-only fitness gate (Task 7) asserts this.
 */
export const listMyProviders = defineQuery({
  input: zodSchema(z.object({})),
  output: zodSchema(z.array(providerListItemReadModel)),
  docs: {
    summary: "Providers the authenticated user belongs to",
    tags: ["Provider"],
  },
});

export const getProviderDetail = defineQuery({
  input: zodSchema(z.object({ providerId: z.string().min(1) })),
  output: zodSchema(providerDetailReadModel),
  docs: {
    summary: "Provider detail with members and invites",
    tags: ["Provider"],
  },
});

export const providerReadSchema = defineGraphQLSchema(
  {
    provider: {
      mine: listMyProviders,
      byId: getProviderDetail,
    },
  },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
