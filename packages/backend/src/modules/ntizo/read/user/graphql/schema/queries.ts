import { z } from "zod";
import { defineQuery, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import {
  addressReadModel,
  currentUserReadModel,
  userAdminReadModel,
} from "@ntizo/shared/read-models";
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

/**
 * Everyone on the platform, for the administration list.
 *
 * Paged and filtered server-side: this list has no ceiling on its size, and
 * choosing which fifty of ten thousand to draw is not a decision the browser
 * can make. Guarded by the handler, which refuses anyone whose platform role
 * is not `admin`.
 */
export const listUsersForAdmin = defineQuery({
  input: zodSchema(
    z.object({
      role: z.string().trim().max(40).optional(),
      search: z.string().trim().max(120).optional(),
      limit: z.number().int().min(1).max(50).optional(),
      offset: z.number().int().min(0).optional(),
    }),
  ),
  output: zodSchema(z.array(userAdminReadModel)),
  docs: { summary: "Every user, for administration", tags: ["Admin"] },
});

export const userReadSchema = defineGraphQLSchema(
  {
    user: {
      me: getCurrentUser,
      myAddresses: listMyAddresses,
      allForAdmin: listUsersForAdmin,
    },
  },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
