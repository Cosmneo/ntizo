import { z } from "zod";
import { defineQuery, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { currentUserReadModel } from "@ntizo/shared/read-models";
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

export const userReadSchema = defineGraphQLSchema(
  { user: { me: getCurrentUser } },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
