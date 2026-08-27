import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";
import { messagingErrorCode } from "@/features/messaging/viewmodel/messaging-error";

/**
 * Field name is flat (`communicationSend`, not `communication { send }`) —
 * see the comment on `messagingQueries` in `data/messaging.repository.ts`
 * for how the schema builder derives it, confirmed the same way:
 * introspecting the running API's mutation type.
 *
 * `body` is capped at 4000 characters server-side
 * (`z.string().trim().min(1).max(4000)`, mirroring `Message.compose`'s own
 * bound) and refused as `VALIDATION_ERROR` past it — see
 * `MESSAGE_BODY_MAX_LENGTH` in `domain/types.ts`. A composer built on this
 * hook must stop someone at that length, not let them find out on submit.
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
 */
export function sendMessage(threadId: string, body: string): Promise<string> {
  return sessionGraphql<{ communicationSend: { id: string } }>(SEND, {
    input: { threadId, body },
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
    mutationFn: ({ threadId, body }: { threadId: string; body: string }) =>
      sendMessage(threadId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["messaging"] }),
  });

  return {
    send: (threadId: string, body: string) =>
      mutation.mutate({ threadId, body }),
    sending: mutation.isPending,
    /**
     * `"VALIDATION_ERROR"` for an empty or >4000-character body,
     * `"THREAD_NOT_VISIBLE"` for a thread the sender can no longer reach
     * (the specific domain code, not the coarse `"UNPROCESSABLE"` it wears
     * on the wire) — see `messagingErrorCode`'s doc comment for why each
     * reads a different field of the underlying `GraphqlError`.
     */
    errorCode: messagingErrorCode(mutation.error),
  };
}
