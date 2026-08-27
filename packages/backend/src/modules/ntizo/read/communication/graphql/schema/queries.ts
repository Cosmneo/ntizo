import { z } from "zod";
import { defineQuery, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { threadPageReadModel, messagePageReadModel } from "@ntizo/shared/read-models";
import { ntizoGraphqlContextSchema } from "../../../../graphql/context";

/**
 * Paging arguments, `.optional()` rather than `.default()`.
 *
 * A zod default does not reach the GraphQL schema — the argument still
 * emits as required and every caller would have to send one. The real
 * default and the clamp live in the projections. `.min()`/`.max()` *do*
 * reach the emitted field, so a limit outside this range is a
 * `VALIDATION_ERROR`, not a silently capped page — follow-up #20's lesson,
 * applied rather than rediscovered, same as `read/activity`'s and
 * `read/notification`'s.
 */
const paging = {
  limit: z.number().int().min(1).max(50).optional(),
  cursor: z.string().optional(),
};

/**
 * The caller's own inbox. Takes no user id — it resolves from the session,
 * so there is nothing to tamper with.
 */
export const listMyThreads = defineQuery({
  input: zodSchema(z.object(paging)),
  output: zodSchema(threadPageReadModel),
  docs: { summary: "Your own conversations", tags: ["Communication"] },
});

/**
 * One provider's inbox. `providerId` is an argument, unlike `listMyThreads`
 * — membership is checked in the projection, not assumed from the session.
 */
export const listProviderThreads = defineQuery({
  input: zodSchema(z.object({ providerId: z.string().min(1), ...paging })),
  output: zodSchema(threadPageReadModel),
  docs: { summary: "A workspace's conversations", tags: ["Communication"] },
});

/** One conversation's messages. Visibility is checked in the projection. */
export const listThreadMessages = defineQuery({
  input: zodSchema(z.object({ threadId: z.string().min(1), ...paging })),
  output: zodSchema(messagePageReadModel),
  docs: { summary: "One conversation's messages", tags: ["Communication"] },
});

/**
 * Nested one level, like `activity`'s and `notification`'s: the field kit
 * flattens this to `communicationMyThreads` / `communicationProviderThreads`
 * / `communicationThreadMessages` on the wire — `{ communication: { myThreads } }`
 * → `communicationMyThreads`, never `communication.myThreads`. Task 8's
 * frontend calls them by those flattened names.
 */
export const communicationReadSchema = defineGraphQLSchema(
  {
    communication: {
      myThreads: listMyThreads,
      providerThreads: listProviderThreads,
      threadMessages: listThreadMessages,
    },
  },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
