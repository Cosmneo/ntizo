import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";
import { messagingErrorCode } from "@/features/messaging/viewmodel/messaging-error";
import type { AttachmentDescriptor } from "@/features/messaging/domain/types";

/**
 * Field name is flat (`communicationSend`, not `communication { send }`) —
 * see the comment on `messagingQueries` in `data/messaging.repository.ts`
 * for how the schema builder derives it, confirmed the same way:
 * introspecting the running API's mutation type.
 *
 * `body` is capped at 4000 characters server-side
 * (`z.string().trim().max(4000)`, mirroring `Message.compose`'s own bound)
 * and refused as `VALIDATION_ERROR` past it — see `MESSAGE_BODY_MAX_LENGTH`
 * in `domain/types.ts`. A composer built on this hook must stop someone at
 * that length, not let them find out on submit. No server-side `.min(1)`
 * any more: a body-less send is legal exactly when `attachments` is not
 * empty (see `AttachmentDescriptor`'s own doc comment) — refused as
 * `MESSAGE_EMPTY` only when both are. The body is also checked server-side
 * for a phone number, email, or link (`hasContact`, run inside
 * `SendMessageCommand.execute`) and refused as `MESSAGE_CONTAINS_CONTACT` —
 * the composer runs the identical check on every keystroke, but this hook
 * itself does not duplicate it; `sendMessage` is a thin wire call.
 *
 * `attachments` carries only `storageKey` per entry, capped at 5
 * server-side — see `AttachmentDescriptor`'s own doc comment for why
 * `fileName`/`contentType`/`sizeBytes` are never sent.
 */
const SEND = `
  mutation SendMessage($input: CommunicationSendInput!) {
    communicationSend(input: $input) { id }
  }`;

/**
 * The plain network call, exported separately from the hook so it can be
 * tested against the real, unmocked query string (`spy.mock.calls[0][0]`)
 * without rendering a component — the same split `startThread`
 * (`use-start-thread.ts`) and `markThreadRead` (`use-mark-read.ts`) make.
 * This one field went a whole review round with no such test at all — a
 * nested `communication { send(...) } }` rewrite passed `vitest` and
 * `tsc` clean, the exact regression this project has already lost a round
 * to twice elsewhere. See `__tests__/use-send-message.test.ts`.
 *
 * `attachments` always rides along, even as `[]` for a body-only send —
 * one shape rather than two ("with attachments" / "without"), and `[]` is
 * exactly what an `.optional()` array input treats identically to omitting
 * it (`resolveAttachments` maps over zero descriptors either way).
 */
export function sendMessage(
  threadId: string,
  body: string,
  attachments: AttachmentDescriptor[] = [],
): Promise<string> {
  return sessionGraphql<{ communicationSend: { id: string } }>(SEND, {
    input: { threadId, body, attachments },
  }).then((d) => d.communicationSend.id);
}

/**
 * Sending into an existing conversation.
 *
 * Invalidates the whole `["messaging"]` prefix rather than one query: the
 * thread just sent into (`["messaging", "thread", threadId]`) and every
 * loaded inbox page whose `lastMessageAt`/`lastMessagePreview` that message
 * just changed (`["messaging", "threads", ...]`) are both downstream of
 * this — same reasoning the notifications feature's `useMarkRead` gives
 * for invalidating the whole `["notifications"]` prefix instead of
 * enumerating query keys, and this feature's own `use-mark-read.ts` reuses
 * for the same reason.
 *
 * No optimistic update, for the same reason `useMarkRead` skips one: a
 * message that appeared to send and then silently failed is a lie the
 * sender has to notice and retry, and the round trip is one insert. The
 * open thread also polls every 5s (`useThread`), so a successful send that
 * this invalidation missed still shows up shortly after.
 */
export function useSendMessage() {
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({
      threadId,
      body,
      attachments,
    }: {
      threadId: string;
      body: string;
      attachments: AttachmentDescriptor[];
    }) => sendMessage(threadId, body, attachments),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["messaging"] }),
  });

  return {
    send: (threadId: string, body: string, attachments: AttachmentDescriptor[] = []) =>
      mutation.mutate({ threadId, body, attachments }),
    sending: mutation.isPending,
    /**
     * `"VALIDATION_ERROR"` for a body over 4000 characters — no longer for
     * an empty one; `.min(1)` came off this schema so a caption-less photo
     * could send (see this file's own doc comment). An empty, attachment-
     * less body now reaches the use case and comes back `"MESSAGE_EMPTY"`
     * instead. `"THREAD_NOT_VISIBLE"` for a thread the sender can no longer
     * reach (the specific domain code, not the coarse `"UNPROCESSABLE"` it
     * wears on the wire) — see `messagingErrorCode`'s doc comment for why
     * each reads a different field of the underlying `GraphqlError`.
     */
    errorCode: messagingErrorCode(mutation.error),
  };
}
