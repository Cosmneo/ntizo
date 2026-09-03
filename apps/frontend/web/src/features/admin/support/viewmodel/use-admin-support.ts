import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminSupportQueries,
  markSupportRequestRead,
  replyToSupportRequest,
  resolveSupportRequest,
  type AdminSupportSearch,
} from "@/features/admin/support/data/admin-support.repository";
import type { AttachmentDescriptor } from "@/features/messaging/domain/types";
import { messagingErrorCode } from "@/features/messaging/viewmodel/messaging-error";

export function useAdminSupport(search: AdminSupportSearch) {
  const query = useInfiniteQuery(adminSupportQueries.all(search));
  return {
    requests: query.data?.pages.flatMap((page) => page.items) ?? [],
    loading: query.isPending,
    hasMore: query.hasNextPage,
    loadMore: () => void query.fetchNextPage(),
    errorCode: messagingErrorCode(query.error),
  };
}

export function useSupportOpenCount() {
  return useQuery(adminSupportQueries.openCount());
}

export function useAdminSupportRequest(threadId: string) {
  return useQuery(adminSupportQueries.one(threadId));
}

/**
 * `errorCode`, like every other hook in this file: without it a conversation
 * that failed to load was indistinguishable from one with no messages in it,
 * and the page happily offered "reply" and "resolve" over the silence — an
 * administrator answering a request whose content they were never shown.
 */
export function useAdminSupportMessages(threadId: string) {
  const query = useInfiniteQuery(adminSupportQueries.messages(threadId));
  return {
    messages: query.data?.pages.flatMap((page) => page.items) ?? [],
    loading: query.isPending,
    hasMore: query.hasNextPage,
    loadMore: () => void query.fetchNextPage(),
    // `failed` alongside `errorCode` for the same reason `resolve` carries
    // both: a network failure is not a `GraphqlError` and has no code.
    failed: query.isError,
    errorCode: messagingErrorCode(query.error),
  };
}

/** Every write invalidates the whole `["admin","support"]` key: a reply moves the row in the queue and changes the open count. */
function useSupportMutation<T>(fn: (input: T) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin", "support"] }),
  });
}

export function useReplyToSupportRequest() {
  const mutation = useSupportMutation(
    ({ threadId, body, attachments }: { threadId: string; body: string; attachments?: AttachmentDescriptor[] }) =>
      replyToSupportRequest(threadId, body, attachments ?? []),
  );
  return {
    reply: (threadId: string, body: string, attachments: AttachmentDescriptor[] = []) =>
      mutation.mutate({ threadId, body, attachments }),
    replying: mutation.isPending,
    errorCode: messagingErrorCode(mutation.error),
  };
}

/**
 * `errorCode`, matching `useReplyToSupportRequest` above. Resolving is the
 * one write on this page that can lose a race: two administrators working
 * the same queue, the second one's `supportResolve` answered
 * `SUPPORT_ALREADY_RESOLVED`. Without an error channel the button simply
 * stopped spinning and the badge went on saying "open", which reads as the
 * click having done nothing at all — as does any network failure.
 */
export function useResolveSupportRequest() {
  const mutation = useSupportMutation((threadId: string) => resolveSupportRequest(threadId));
  return {
    resolve: (threadId: string) => mutation.mutate(threadId),
    resolving: mutation.isPending,
    // Both, because they answer different questions. `errorCode` is
    // `undefined` for anything that is not a `GraphqlError` — a dropped
    // connection, most of all — so a caller that rendered only on a code
    // would still say nothing about the failure most likely to happen.
    failed: mutation.isError,
    errorCode: messagingErrorCode(mutation.error),
  };
}

export function useMarkSupportRequestRead() {
  const mutation = useSupportMutation((threadId: string) => markSupportRequestRead(threadId));
  return { markRead: (threadId: string) => mutation.mutate(threadId) };
}
