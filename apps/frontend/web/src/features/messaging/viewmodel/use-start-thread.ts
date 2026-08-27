import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";
import { messagingErrorCode } from "@/features/messaging/viewmodel/messaging-error";

/**
 * Field name is flat (`communicationStartThread`, not
 * `communication { startThread }`) — see the comment on `messagingQueries`
 * in `data/messaging.repository.ts` for how the schema builder derives it.
 */
const START_THREAD = `
  mutation StartThread($input: CommunicationStartThreadInput!) {
    communicationStartThread(input: $input) { id }
  }`;

/**
 * The plain network call, exported separately from the hook so it can be
 * tested against the real, unmocked query string (`spy.mock.calls[0][0]`)
 * without rendering a component — the same split `use-current-user.ts`
 * makes for `fetchCurrentUser`.
 */
export function startThread(providerId: string): Promise<string> {
  return sessionGraphql<{ communicationStartThread: { id: string } }>(START_THREAD, {
    input: { providerId },
  }).then((d) => d.communicationStartThread.id);
}

/**
 * Starting — or resuming — a conversation with a provider.
 *
 * Idempotent server-side: `StartThreadCommand` resolves this as an upsert
 * against `thread_customer_provider_uq`, so calling it twice for the same
 * (customer, provider) pair returns the same thread id rather than opening
 * a second one. A "Enviar mensagem" button can call `start` unconditionally
 * — it never needs to check whether a thread already exists first.
 *
 * Invalidates `["messaging", "threads", "mine"]` on success: the
 * new-or-resumed thread belongs at the top of the caller's own inbox next
 * time it loads. Narrower than `useSendMessage`'s whole-`["messaging"]`
 * invalidation on purpose — starting a thread changes nothing about any
 * provider's own inbox (`forProvider`) or any already-open conversation
 * (`thread`) until a message is actually sent into it.
 */
export function useStartThread() {
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: startThread,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["messaging", "threads", "mine"] }),
  });

  return {
    /** Resolves to the thread id — start (or resume) a conversation, then navigate there. */
    start: (providerId: string) => mutation.mutateAsync(providerId),
    starting: mutation.isPending,
    /**
     * `"UNAUTHENTICATED"` for a signed-out caller, `"PROVIDER_NOT_CONTACTABLE"`
     * for `ProviderNotContactableError` (the specific domain code, not the
     * coarse `"UNPROCESSABLE"` it wears on the wire) — see
     * `messagingErrorCode`'s doc comment.
     */
    errorCode: messagingErrorCode(mutation.error),
  };
}
