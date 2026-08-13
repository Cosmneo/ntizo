import { z } from "zod";
import { defineQuery, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { localeSchema, serviceLocationTypeSchema } from "@ntizo/shared";
import { categoryPageReadModel, servicePageReadModel } from "@ntizo/shared/read-models";

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
 * The published services, resolved into one language, of active providers.
 *
 * Also on the public tier, for the same reason `listCategories` is: a service
 * page reads this signed out, and it must not depend on a session existing.
 * `categoryCode` is optional so the same query serves both the full browse
 * and a category filtered one, without a second field to keep in sync with
 * this one. `providerId` is the same idea for a provider's own public page —
 * added for that page rather than a client paging through every service on
 * the platform and filtering in the browser, which would page past every
 * other business to find one's own handful.
 */
export const listServices = defineQuery({
  input: zodSchema(
    z.object({
      locale: localeSchema.optional(),
      categoryCode: z.string().min(1).max(60).optional(),
      providerId: z.string().min(1).optional(),
      locationType: serviceLocationTypeSchema.optional(),
      sort: z.enum(["default", "newest"]).optional(),
      // Optional, not `.default()`: a zod default does not survive into the
      // GraphQL schema, so the fallback belongs in the handler where it can
      // actually run.
      limit: z.number().int().min(1).max(48).optional(),
      offset: z.number().int().min(0).optional(),
    }),
  ),
  output: zodSchema(servicePageReadModel),
  docs: { summary: "Published services in one language", tags: ["Catalog"] },
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
  service: { all: listServices },
});
