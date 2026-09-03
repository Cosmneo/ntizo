import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import type { MessagePageDTO, SupportRequestPageDTO, SupportRequestSummaryDTO } from "@ntizo/shared/read-models";
import type { AttachmentDescriptor } from "@/features/messaging/domain/types";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";

const ALL = `
  query SupportRequests($input: SupportRequestsInput!) {
    supportRequests(input: $input) {
      items {
        threadId audience subject status requesterUserId requesterName
        providerId providerName bookingId lastMessageAt lastMessagePreview
        unreadForAdmin createdAt resolvedAt
      }
      nextCursor
    }
  }`;

const ONE = `
  query SupportRequest($input: SupportRequestInput!) {
    supportRequest(input: $input) {
      threadId audience subject status requesterUserId requesterName
      providerId providerName bookingId lastMessageAt lastMessagePreview
      unreadForAdmin createdAt resolvedAt
    }
  }`;

const MESSAGES = `
  query SupportRequestMessages($input: SupportRequestMessagesInput!) {
    supportRequestMessages(input: $input) {
      items { id threadId senderUserId senderSide body readAt createdAt attachments { id fileName contentType sizeBytes } }
      nextCursor
    }
  }`;

/**
 * A literal `input: {}`, not a `$input` variable of a named type.
 *
 * `countOpenSupportRequests`'s input schema is `z.object({})` — no
 * properties — and the schema builder falls back to the `JSON` scalar for an
 * empty input object, because a GraphQL input object type must declare at
 * least one field. So `SupportOpenCountInput` is a name the schema never
 * emits: the SDL reads `supportOpenCount(input: JSON!)`, and a document that
 * declares `$input: SupportOpenCountInput!` fails validation before it
 * executes — "Unknown type" — which the queue rendered as a confident
 * "0 open requests". The same reasoning and the same shape as
 * `notificationQueries.mineUnreadCount`; see that file's doc comment.
 */
const OPEN_COUNT = `
  query SupportOpenCount {
    supportOpenCount(input: {}) { count }
  }`;

const REPLY = `
  mutation SupportReply($input: SupportReplyInput!) {
    supportReply(input: $input) { id }
  }`;

const RESOLVE = `
  mutation SupportResolve($input: SupportResolveInput!) {
    supportResolve(input: $input) { threadId status }
  }`;

const MARK_READ = `
  mutation SupportMarkRead($input: SupportMarkReadInput!) {
    supportMarkRead(input: $input) { marked }
  }`;

export const ADMIN_SUPPORT_PAGE_SIZE = 25;
const MESSAGES_PAGE_SIZE = 30;

export interface AdminSupportSearch {
  status?: "open" | "resolved";
  audience?: "customer" | "provider";
}

export const adminSupportQueries = {
  /**
   * The queue. The whole search is the key — "resolved" is a different
   * result set from "open", not the same one filtered.
   *
   * Cursor-paged (`<ISO>|<threadId>`), unlike the contact queue's
   * offset+total: this list orders by the thread's last message, which
   * moves as people reply, and an offset into a list that reorders under
   * you shows the same row twice.
   */
  all: (search: AdminSupportSearch) =>
    infiniteQueryOptions({
      queryKey: ["admin", "support", search] as const,
      queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
        sessionGraphql<{ supportRequests: SupportRequestPageDTO }>(ALL, {
          input: {
            limit: ADMIN_SUPPORT_PAGE_SIZE,
            cursor: pageParam,
            ...(search.status ? { status: search.status } : {}),
            ...(search.audience ? { audience: search.audience } : {}),
          },
        }).then((d) => d.supportRequests),
      // `undefined`, never `null`. The SDL declares `cursor: String`, so
      // GraphQL itself would accept a null — but the kit then validates the
      // input against `z.string().optional()`, which accepts an absent key
      // and REJECTS an explicit null ("expected string, received null"), so
      // a first page sent with `cursor: null` came back as a validation
      // error over an empty table. `undefined` is dropped by
      // `JSON.stringify` and the key never reaches the wire. Same mapping,
      // for the same reason, as `messagingQueries.mine`.
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last: SupportRequestPageDTO) => last.nextCursor ?? undefined,
    }),

  one: (threadId: string) =>
    queryOptions({
      queryKey: ["admin", "support", "one", threadId] as const,
      queryFn: () =>
        sessionGraphql<{ supportRequest: SupportRequestSummaryDTO }>(ONE, {
          input: { threadId },
        }).then((d) => d.supportRequest),
      enabled: threadId.length > 0,
    }),

  /** Polls like the participant conversation does — an admin sits on this screen while somebody replies. */
  messages: (threadId: string) =>
    infiniteQueryOptions({
      queryKey: ["admin", "support", "messages", threadId] as const,
      queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
        sessionGraphql<{ supportRequestMessages: MessagePageDTO }>(MESSAGES, {
          input: { threadId, limit: MESSAGES_PAGE_SIZE, cursor: pageParam },
        }).then((d) => d.supportRequestMessages),
      // `undefined`, never `null` — see `all` above.
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last: MessagePageDTO) => last.nextCursor ?? undefined,
      enabled: threadId.length > 0,
      refetchInterval: 5_000,
    }),

  openCount: () =>
    queryOptions({
      queryKey: ["admin", "support", "openCount"] as const,
      queryFn: () =>
        sessionGraphql<{ supportOpenCount: { count: number } }>(OPEN_COUNT, {}).then(
          (d) => d.supportOpenCount.count,
        ),
    }),
};

export async function replyToSupportRequest(
  threadId: string,
  body: string,
  attachments: AttachmentDescriptor[] = [],
): Promise<string> {
  const d = await sessionGraphql<{ supportReply: { id: string } }>(REPLY, {
    input: { threadId, body: body.trim(), ...(attachments.length > 0 ? { attachments } : {}) },
  });
  return d.supportReply.id;
}

export async function resolveSupportRequest(threadId: string): Promise<void> {
  await sessionGraphql(RESOLVE, { input: { threadId } });
}

export async function markSupportRequestRead(threadId: string): Promise<number> {
  const d = await sessionGraphql<{ supportMarkRead: { marked: number } }>(MARK_READ, {
    input: { threadId },
  });
  return d.supportMarkRead.marked;
}
