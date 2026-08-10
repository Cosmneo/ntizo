import { z } from "zod";
import { defineQuery, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { addressReadModel, currentUserReadModel } from "@ntizo/shared/read-models";
import { ntizoGraphqlContextSchema } from "../../../../graphql/context";

/**
 * READ-side GraphQL schema for the user BC. Queries ONLY — the
 * read=queries-only fitness gate asserts this.
 */
export const getCurrentUser = defineQuery({
  input: zodSchema(z.object({})),
  output: zodSchema(currentUserReadModel),
  docs: { summary: "The authenticated user's profile", tags: ["User"] },
});

export const listMyAddresses = defineQuery({
  input: zodSchema(z.object({})),
  output: zodSchema(z.array(addressReadModel)),
  docs: { summary: "The authenticated user's saved addresses", tags: ["User"] },
});

export const userReadSchema = defineGraphQLSchema(
  { user: { me: getCurrentUser, myAddresses: listMyAddresses } },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
