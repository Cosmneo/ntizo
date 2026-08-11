import { z } from "zod";
import { defineQuery, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { localeSchema } from "@ntizo/shared";
import { categoryPageReadModel } from "@ntizo/shared/read-models";

/**
 * The active categories, resolved into one language.
 *
 * On the public tier because the home page reads it signed out, and because a
 * public field living inside the session-authed private schema is one omission
 * away from leaking or one guard away from being unreachable.
 *
 * The locale is an argument rather than read from the session for the same
 * reason: somebody browsing with no account still has a language.
 */
export const listCategories = defineQuery({
  input: zodSchema(
    z.object({
      locale: localeSchema.optional(),
      // Optional, not `.default()`: a zod default does not survive into the
      // GraphQL schema, so the fallback belongs in the handler where it can
      // actually run.
      limit: z.number().int().min(1).max(48).optional(),
      offset: z.number().int().min(0).optional(),
    }),
  ),
  output: zodSchema(categoryPageReadModel),
  docs: { summary: "Active categories in one language", tags: ["Catalog"] },
});

/**
 * No context schema, like the other public slices.
 *
 * Declaring the private one made every field on this mount demand a session,
 * and the landing page — which reads this signed out — got
 * "Authentication required" from a query built to need nobody. The public
 * mount deliberately supplies an empty context; a schema that asks for a
 * requester there can only ever refuse.
 */
export const catalogPublicSchema = defineGraphQLSchema({
  category: { all: listCategories },
});
