import type { MessagePageDTO, ThreadPageDTO } from "@ntizo/shared/read-models";
import type { Thread } from "../../../../bounded-contexts/communication/domain/aggregates/thread.aggregate";
import type { ThreadRepositoryPort } from "../../../../bounded-contexts/communication/app/ports/outbound/thread.repository.port";
import type { MessageRepositoryPort } from "../../../../bounded-contexts/communication/app/ports/outbound/message.repository.port";
import type { ProviderReaderPort } from "../../../../bounded-contexts/communication/app/ports/outbound/provider-reader.port";
import { ThreadNotVisibleError } from "../../../../bounded-contexts/communication/domain/exceptions";
import type { ProviderNameReaderPort } from "../ports/outbound/provider-name-reader.port";
import type { CustomerNameReaderPort } from "../ports/outbound/customer-name-reader.port";
import type { ThreadPreviewReaderPort } from "../ports/outbound/thread-preview-reader.port";

/**
 * The default page, and the ceiling.
 *
 * Both live here rather than as zod `.default()` on the field: a zod default
 * does not survive into the GraphQL schema — the argument still emits as
 * required and every caller would have to send one. `limit` is
 * caller-controlled and an unbounded one is a way to ask for the whole
 * table — follow-up #20's lesson, applied rather than rediscovered, same as
 * `read/activity`'s and `read/notification`'s.
 */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function clampLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
}

/**
 * Turns a page of `Thread` aggregates into the wire shape an inbox row
 * needs. Four enrichments, each one batched query for the whole page rather
 * than one per row — unread counts the way `countUnreadForViewer`'s own doc
 * comment demands, provider names, customer names and last-message previews
 * the same way for the same reason. Shared by both `ListMyThreadsProjection`
 * and `ListProviderThreadsProjection`: the enrichment is identical, only the
 * page's scope differs.
 *
 * **Both names are resolved for both call sites.** `ListMyThreadsProjection`
 * only ever *displays* `providerName`, `ListProviderThreadsProjection` only
 * ever displays `customerName` — but this function does not know which side
 * is asking, and a design that skipped the name the caller supposedly
 * doesn't need would be two functions wearing one name. See
 * `threadSummaryReadModel`'s own doc comment for why the DTO itself always
 * carries both.
 */
async function toThreadSummaries(
  threads: Thread[],
  viewerUserId: string,
  deps: {
    messages: MessageRepositoryPort;
    providerNames: ProviderNameReaderPort;
    customerNames: CustomerNameReaderPort;
    previews: ThreadPreviewReaderPort;
  },
): Promise<ThreadPageDTO["items"]> {
  if (threads.length === 0) return [];

  const threadIds = threads.map((t) => t.id!);
  const providerIds = [...new Set(threads.map((t) => t.providerId))];
  const customerUserIds = [...new Set(threads.map((t) => t.customerUserId))];

  const [unread, providerNamesById, customerNamesById, previewByThread] = await Promise.all([
    deps.messages.countUnreadForViewer(threadIds, viewerUserId),
    deps.providerNames.findNamesByIds(providerIds),
    deps.customerNames.findNamesByIds(customerUserIds),
    deps.previews.findLastMessageBodies(threadIds),
  ]);

  return threads.map((t) => ({
    id: t.id!,
    providerId: t.providerId,
    providerName: providerNamesById.get(t.providerId) ?? "",
    customerName: customerNamesById.get(t.customerUserId) ?? "",
    lastMessageAt: t.lastMessageAt.toISOString(),
    lastMessagePreview: previewByThread.get(t.id!) ?? "",
    // A thread absent from the map has nothing unread for this viewer —
    // `countUnreadForViewer`'s own doc comment: absent, not present with 0.
    unreadCount: unread.get(t.id!) ?? 0,
  }));
}

/**
 * A customer's own inbox — the providers they have messaged, newest
 * last-message first.
 *
 * Takes no reader-supplied user id. `requesterUserId` is stamped by the
 * GraphQL handler from the session, never taken from `args` — this class has
 * no way to read anybody's inbox but its own caller's.
 */
export class ListMyThreadsProjection {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly messages: MessageRepositoryPort,
    private readonly providerNames: ProviderNameReaderPort,
    private readonly customerNames: CustomerNameReaderPort,
    private readonly previews: ThreadPreviewReaderPort,
  ) {}

  async execute(input: {
    requesterUserId: string;
    limit?: number | undefined;
    cursor?: string | null | undefined;
  }): Promise<ThreadPageDTO> {
    const limit = clampLimit(input.limit);
    const page = await this.threads.listForCustomer(input.requesterUserId, limit, input.cursor ?? null);
    const items = await toThreadSummaries(page.items, input.requesterUserId, {
      messages: this.messages,
      providerNames: this.providerNames,
      customerNames: this.customerNames,
      previews: this.previews,
    });
    return { items, nextCursor: page.nextCursor };
  }
}

/**
 * One provider's inbox — the customers who have messaged them, newest
 * last-message first.
 *
 * `listForProvider` has no built-in viewer check, unlike `findVisible` — the
 * membership gate lives here, or any signed-in user could read any
 * provider's inbox by passing a `providerId` that is not theirs.
 */
export class ListProviderThreadsProjection {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly messages: MessageRepositoryPort,
    private readonly providers: ProviderReaderPort,
    private readonly providerNames: ProviderNameReaderPort,
    private readonly customerNames: CustomerNameReaderPort,
    private readonly previews: ThreadPreviewReaderPort,
  ) {}

  async execute(input: {
    requesterUserId: string;
    providerId: string;
    limit?: number | undefined;
    cursor?: string | null | undefined;
  }): Promise<ThreadPageDTO> {
    if (!(await this.providers.isMember(input.providerId, input.requesterUserId))) {
      // Same refusal `findVisible` gives for "not yours" — telling this
      // apart from "no such provider" would tell a caller probing provider
      // ids which ones are real.
      throw new ThreadNotVisibleError();
    }

    const limit = clampLimit(input.limit);
    const page = await this.threads.listForProvider(input.providerId, limit, input.cursor ?? null);
    const items = await toThreadSummaries(page.items, input.requesterUserId, {
      messages: this.messages,
      providerNames: this.providerNames,
      customerNames: this.customerNames,
      previews: this.previews,
    });
    return { items, nextCursor: page.nextCursor };
  }
}

/**
 * One conversation's messages, newest first.
 *
 * The visibility gate is `findVisible` itself, not a separate check here:
 * the customer on the thread, or a member of its provider, may read it — see
 * the port's own doc comment for why "does not exist" and "not yours" answer
 * identically.
 */
export class ListThreadMessagesProjection {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly messages: MessageRepositoryPort,
  ) {}

  async execute(input: {
    requesterUserId: string;
    threadId: string;
    limit?: number | undefined;
    cursor?: string | null | undefined;
  }): Promise<MessagePageDTO> {
    const visible = await this.threads.findVisible(input.threadId, input.requesterUserId);
    if (!visible) {
      throw new ThreadNotVisibleError();
    }

    const limit = clampLimit(input.limit);
    const page = await this.messages.listForThread(input.threadId, limit, input.cursor ?? null);

    return {
      items: page.items.map((m) => ({
        id: m.id!,
        threadId: m.threadId,
        senderUserId: m.senderUserId,
        body: m.body,
        readAt: m.readAt ? m.readAt.toISOString() : null,
        createdAt: m.createdAt.toISOString(),
      })),
      nextCursor: page.nextCursor,
    };
  }
}
