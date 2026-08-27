import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";
import { messagingErrorCode } from "@/features/messaging/viewmodel/messaging-error";

/**
 * Field name is flat (`communicationMarkRead`, not
 * `communication { markRead }`) — see the comment on `messagingQueries` in
 * `data/messaging.repository.ts` for how the schema builder derives it.
 */
const MARK_READ = `
  mutation MarkThreadRead($input: CommunicationMarkReadInput!) {
    communicationMarkRead(input: $input) { marked }
  }`;

/**
 * The plain network call, exported separately from the hook so it can be
 * tested against the real, unmocked query string without rendering a
 * component — same split `startThread` makes in `use-start-thread.ts`.
 */
export function markThreadRead(threadId: string): Promise<number> {
  return sessionGraphql<{ communicationMarkRead: { marked: number } }>(MARK_READ, {
    input: { threadId },
  }).then((d) => d.communicationMarkRead.marked);
}

/**
 * Marking everything the other side sent in one conversation as read.
 *
 * Invalidates the whole `["messaging"]` prefix, not just the thread just
 * read: `useThreads`'/`useProviderThreads`'s `unreadCount` for this thread
 * and the thread's own messages (`readAt` moving off `null`) are both
 * downstream of one mark-read call. An inbox that only invalidated its own
 * list would keep showing a stale unread badge nowhere near the
 * conversation the person just plainly read — the gap this hook exists to
 * close. Same whole-prefix reasoning `useSendMessage` and the
 * notifications feature's `useMarkRead` both give for their own prefixes.
 */
export function useMarkRead() {
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: markThreadRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["messaging"] }),
  });

  return {
    markRead: (threadId: string) => mutation.mutate(threadId),
    marking: mutation.isPending,
    /** `"THREAD_NOT_VISIBLE"` for a thread the caller cannot see (or that does not exist); `"UNAUTHENTICATED"` for a signed-out caller. */
    errorCode: messagingErrorCode(mutation.error),
  };
}
