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
 * The bounds here mirror the aggregate's rather than replacing them — same
 * split `review/graphql/schema/mutations.ts` uses for `rating`: this is the
 * edge refusing obvious nonsense cheaply, and `Message.compose`
 * (`MESSAGE_BODY_MAX = 4000`, `MAX_ATTACHMENTS = 5`) is where the rules are
 * *defined*. Both bounds are refused twice, in both places, on purpose —
 * duplicated as literals here rather than imported, the same tradeoff
 * `review`'s 1..5 rating bound makes, so this schema file never has to
 * import a bounded-context's domain module.
 *
 * `body` deliberately has no `.min(1)` — Task 2 changed the rule to "body
 * non-empty OR at least one attachment", and `.min(1)` would refuse an
 * empty, attachment-carrying body before `Message.compose` (the actual
 * source of that rule) ever runs. An empty body with no attachments still
 * refuses, just one layer down, as `MessageEmptyError`.
 *
 * `attachments` carries only `storageKey` — never `fileName`, `contentType`,
 * or `sizeBytes`. All three are read back from the R2 object itself
 * (`AttachmentStoragePort.head`, called from
 * `SendMessageCommand.resolveAttachments`), never taken from the wire: a
 * caller's claim about its own file's type is exactly what Task 3's
 * `sniffContentType` and Task 5's upload route exist to stop being trusted,
 * and accepting one here would undo that one hop later. `fileName` used to
 * be accepted here too, until the whole-branch review found that the client
 * could upload a clean file (passing the upload route's own `hasContact`
 * check on the name) and then send back an entirely different, unchecked
 * name in THIS call — the upload response already told the caller the
 * clean name for display; there was never a reason for it to say it again.
 */
export const send = defineMutation({
  input: zodSchema(
    z.object({
      threadId: z.string().min(1),
      body: z.string().trim().max(4000),
      attachments: z
        .array(
          z.object({
            storageKey: z.string().min(1),
          }),
        )
        .max(5)
        .optional(),
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
 * Opening a support request. `subject` is bounded here as the edge's cheap
 * refusal; `SupportRequest.normaliseSubject` (`SUPPORT_SUBJECT_MAX = 120`) is
 * where the rule is defined — the same split `send` makes for `body`.
 * `providerId` is required by the command when `audience` is `provider`,
 * not by this schema: a union input is awkward on the wire, and the
 * command's `SUPPORT_NOT_A_MEMBER` is the right answer for both "no
 * provider" and "not yours".
 */
export const openSupportRequest = defineMutation({
  input: zodSchema(
    z.object({
      audience: z.enum(["customer", "provider"]),
      providerId: z.string().min(1).optional(),
      subject: z.string().trim().min(1).max(120),
      body: z.string().trim().max(4000),
      bookingId: z.string().min(1).optional(),
      attachments: z.array(z.object({ storageKey: z.string().min(1) })).max(5).optional(),
    }),
  ),
  output: zodSchema(z.object({ threadId: z.string().min(1) })),
  docs: { summary: "Open a support request with the platform", tags: ["Communication", "Support"] },
});

/**
 * Nested one level, like `review`'s and `notification`'s: the field kit
 * flattens this to `communicationStartThread` / `communicationSend` /
 * `communicationMarkRead` / `communicationOpenSupportRequest` on the wire —
 * `{ communication: { send } }` → `communicationSend`, never
 * `communication.send`. Task 9's frontend calls them by those flattened
 * names.
 */
export const communicationWriteSchema = defineGraphQLSchema(
  { communication: { startThread, send, markRead, openSupportRequest } },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
