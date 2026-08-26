import { z } from "zod";
import { defineQuery, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { activityPageReadModel } from "@ntizo/shared/read-models";
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
 * Nested one level, like `notification`'s: the field kit flattens this to
 * `activityMine` on the wire — `{ activity: { mine } }` → `activityMine`,
 * never `activity.mine`. Task 8's frontend calls it by that flattened name.
 */
export const activityReadSchema = defineGraphQLSchema(
  {
    activity: {
      mine: listMyActivity,
    },
  },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
