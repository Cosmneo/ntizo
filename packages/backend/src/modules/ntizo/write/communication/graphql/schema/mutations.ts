import { z } from "zod";
import { defineMutation, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { ntizoGraphqlContextSchema } from "../../../../graphql/context";

/**
 * Two mutations, not one union.
 *
 * `startThread` is idempotent — the repository resolves it as an upsert
 * against `thread_customer_provider_uq`, so calling it twice for the same
 * (customer, provider) pair returns the same thread rather than opening a
 * second one. The customer's flow is *start, then send*; everybody replying
 * already holds a `threadId` and never calls this. See
 * `StartThreadCommand`'s doc comment.
 */
export const startThread = defineMutation({
  input: zodSchema(z.object({ providerId: z.string().min(1) })),
  output: zodSchema(z.object({ id: z.string().min(1) })),
  docs: { summary: "Start — or resume — a conversation with a provider", tags: ["Communication"] },
});

/**
 * The bound here mirrors the aggregate's rather than replacing it — same
 * split `review/graphql/schema/mutations.ts` uses for `rating`: this is the
 * edge refusing obvious nonsense cheaply, and `Message.compose`
 * (`MESSAGE_BODY_MAX = 4000`) is where the rule is *defined*. A body over
 * 4000 characters, trimmed, is refused twice, in both places, on purpose —
 * duplicated as a literal here rather than imported, the same tradeoff
 * `review`'s 1..5 rating bound makes, so this schema file never has to
 * import a bounded-context's domain module.
 */
export const send = defineMutation({
  input: zodSchema(
    z.object({
      threadId: z.string().min(1),
      body: z.string().trim().min(1).max(4000),
    }),
  ),
  output: zodSchema(z.object({ id: z.string().min(1) })),
  docs: { summary: "Send a message into an existing conversation", tags: ["Communication"] },
});

export const markRead = defineMutation({
  input: zodSchema(z.object({ threadId: z.string().min(1) })),
  output: zodSchema(z.object({ marked: z.number().int() })),
  docs: { summary: "Mark everything the other side sent in this conversation as read", tags: ["Communication"] },
});

/**
 * Nested one level, like `review`'s and `notification`'s: the field kit
 * flattens this to `communicationStartThread` / `communicationSend` /
 * `communicationMarkRead` on the wire — `{ communication: { send } }` →
 * `communicationSend`, never `communication.send`. Task 9's frontend calls
 * them by those flattened names.
 */
export const communicationWriteSchema = defineGraphQLSchema(
  { communication: { startThread, send, markRead } },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
