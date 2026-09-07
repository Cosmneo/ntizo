import { z } from "zod";
import { defineQuery, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { ACTIVITY_TYPES } from "@ntizo/shared";
import { activityPageReadModel, platformActivityPageReadModel } from "@ntizo/shared/read-models";
import { ntizoGraphqlContextSchema } from "../../../../graphql/context";

/**
 * The caller's own history. Takes no user id — it resolves from the session,
 * so there is nothing to tamper with.
 *
 * `limit`/`cursor` are `.optional()` rather than `.default()`: a zod default
 * does not reach the GraphQL schema — the argument still emits as required
 * and every caller would have to send one. The real default and the clamp
 * live in `ListActivityProjection`. Follow-up #20's lesson, applied rather
 * than rediscovered — same as `read/notification`'s `listMyNotifications`.
 */
export const listMyActivity = defineQuery({
  input: zodSchema(
    z.object({
      limit: z.number().int().min(1).max(50).optional(),
      cursor: z.string().optional(),
    }),
  ),
  output: zodSchema(activityPageReadModel),
  docs: { summary: "Your own activity history", tags: ["Activity"] },
});

/**
 * Everybody's history — the platform's own feed. Guarded by the handler:
 * administrators only, and refused before anything is read.
 *
 * `type` is validated against `ACTIVITY_TYPES` here, the same list the
 * picker on the page offers; `search` is bounded like every other free-text
 * filter, because the string ends up in a LIKE pattern.
 */
export const listPlatformActivity = defineQuery({
  input: zodSchema(
    z.object({
      limit: z.number().int().min(1).max(50).optional(),
      cursor: z.string().optional(),
      type: z.enum(ACTIVITY_TYPES).optional(),
      search: z.string().trim().max(120).optional(),
    }),
  ),
  output: zodSchema(platformActivityPageReadModel),
  docs: { summary: "Everybody's activity, for administration", tags: ["Admin", "Activity"] },
});

/**
 * Nested one level, like `notification`'s: the field kit flattens these to
 * `activityMine` and `activityAll` on the wire — `{ activity: { mine } }` →
 * `activityMine`, never `activity.mine`. The frontend calls them by those
 * flattened names.
 */
export const activityReadSchema = defineGraphQLSchema(
  {
    activity: {
      mine: listMyActivity,
      all: listPlatformActivity,
    },
  },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
