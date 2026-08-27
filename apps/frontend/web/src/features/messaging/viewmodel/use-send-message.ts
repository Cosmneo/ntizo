import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";

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
 * Sending into an existing conversation.
 *
 * Invalidates the whole `["messaging"]` prefix rather than one query: the
 * thread just sent into (`["messaging", "thread", threadId]`) and every
 * loaded inbox page whose `lastMessageAt`/`lastMessagePreview` that message
 * just changed (`["messaging", "threads", ...]`) are both downstream of
 * this — same reasoning `useMarkRead` gives for invalidating the whole
 * `["notifications"]` prefix instead of enumerating query keys here.
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
      sessionGraphql<{ communicationSend: { id: string } }>(SEND, {
        input: { threadId, body },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["messaging"] }),
  });

  return {
    send: (threadId: string, body: string) =>
      mutation.mutate({ threadId, body }),
    sending: mutation.isPending,
  };
}
