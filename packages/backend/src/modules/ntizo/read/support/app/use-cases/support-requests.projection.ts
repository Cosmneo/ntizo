import type { MessagePageDTO, SupportRequestPageDTO, SupportRequestSummaryDTO } from "@ntizo/shared/read-models";
import type {
  SupportAudience,
  SupportStatus,
} from "../../../../shared/infrastructure/database/communication/enums";
import type {
  SupportRequestListItem,
  SupportRequestRepositoryPort,
} from "../../../../bounded-contexts/communication/app/ports/outbound/support-request.repository.port";
import type { ThreadRepositoryPort } from "../../../../bounded-contexts/communication/app/ports/outbound/thread.repository.port";
import type { MessageRepositoryPort } from "../../../../bounded-contexts/communication/app/ports/outbound/message.repository.port";
import type { AttachmentRepositoryPort } from "../../../../bounded-contexts/communication";
import { SupportRequestNotFoundError } from "../../../../bounded-contexts/communication/domain/exceptions";
import type { ProviderNameReaderPort } from "../../../communication/app/ports/outbound/provider-name-reader.port";
import type { CustomerNameReaderPort } from "../../../communication/app/ports/outbound/customer-name-reader.port";
import type { ThreadPreviewReaderPort } from "../../../communication/app/ports/outbound/thread-preview-reader.port";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function clampLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
}

interface Enrichers {
  messages: MessageRepositoryPort;
  providerNames: ProviderNameReaderPort;
  customerNames: CustomerNameReaderPort;
  previews: ThreadPreviewReaderPort;
}

/** Four batched lookups for the whole page — never one per row. Same discipline as `toThreadSummaries`. */
async function toSummaries(items: SupportRequestListItem[], deps: Enrichers): Promise<SupportRequestSummaryDTO[]> {
  if (items.length === 0) return [];
  const threadIds = items.map((i) => i.threadId);
  const providerIds = [...new Set(items.flatMap((i) => (i.providerId ? [i.providerId] : [])))];
  const requesterIds = [...new Set(items.map((i) => i.requesterUserId))];

  const [unread, providerNames, requesterNames, previews] = await Promise.all([
    deps.messages.countUnreadForPlatform(threadIds),
    deps.providerNames.findNamesByIds(providerIds),
    deps.customerNames.findNamesByIds(requesterIds),
    deps.previews.findLastMessageBodies(threadIds),
  ]);

  return items.map((i) => ({
    threadId: i.threadId,
    audience: i.audience,
    subject: i.subject,
    status: i.status,
    requesterUserId: i.requesterUserId,
    requesterName: requesterNames.get(i.requesterUserId) ?? "",
    providerId: i.providerId,
    providerName: i.providerId ? (providerNames.get(i.providerId) ?? "") : "",
    bookingId: i.bookingId,
    lastMessageAt: i.lastMessageAt.toISOString(),
    lastMessagePreview: previews.get(i.threadId)?.body ?? "",
    unreadForAdmin: unread.get(i.threadId) ?? 0,
    createdAt: i.createdAt.toISOString(),
    resolvedAt: i.resolvedAt ? i.resolvedAt.toISOString() : null,
  }));
}

/** The admin queue. The handler proves the role; this class assumes it. */
export class ListSupportRequestsProjection {
  constructor(
    private readonly requests: SupportRequestRepositoryPort,
    private readonly messages: MessageRepositoryPort,
    private readonly providerNames: ProviderNameReaderPort,
    private readonly customerNames: CustomerNameReaderPort,
    private readonly previews: ThreadPreviewReaderPort,
  ) {}

  async execute(input: {
    status?: SupportStatus | undefined;
    audience?: SupportAudience | undefined;
    limit?: number | undefined;
    cursor?: string | null | undefined;
  }): Promise<SupportRequestPageDTO> {
    const page = await this.requests.listForAdmin(
      { status: input.status, audience: input.audience },
      clampLimit(input.limit),
      input.cursor ?? null,
    );
    const items = await toSummaries(page.items, {
      messages: this.messages,
      providerNames: this.providerNames,
      customerNames: this.customerNames,
      previews: this.previews,
    });
    return { items, nextCursor: page.nextCursor };
  }
}

export class GetSupportRequestProjection {
  constructor(
    private readonly requests: SupportRequestRepositoryPort,
    private readonly messages: MessageRepositoryPort,
    private readonly providerNames: ProviderNameReaderPort,
    private readonly customerNames: CustomerNameReaderPort,
    private readonly previews: ThreadPreviewReaderPort,
  ) {}

  async execute(input: { threadId: string }): Promise<SupportRequestSummaryDTO> {
    const item = await this.requests.findListItem(input.threadId);
    if (!item) throw new SupportRequestNotFoundError();
    const [summary] = await toSummaries([item], {
      messages: this.messages,
      providerNames: this.providerNames,
      customerNames: this.customerNames,
      previews: this.previews,
    });
    return summary!;
  }
}

/**
 * The admin reading a conversation. `findSupportThread`, never
 * `findVisible`: the admin is not a participant and must not be admitted
 * as one — and the scope to `type = 'support'` is what keeps an inquiry
 * out of reach, answered as "not found" like a missing id.
 */
export class ListSupportRequestMessagesProjection {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly messages: MessageRepositoryPort,
    private readonly attachments: AttachmentRepositoryPort,
  ) {}

  async execute(input: {
    threadId: string;
    limit?: number | undefined;
    cursor?: string | null | undefined;
  }): Promise<MessagePageDTO> {
    const thread = await this.threads.findSupportThread(input.threadId);
    if (!thread) throw new SupportRequestNotFoundError();

    const page = await this.messages.listForThread(input.threadId, clampLimit(input.limit), input.cursor ?? null);
    const attachmentsByMessage = await this.attachments.listForMessages(page.items.map((m) => m.id!));

    return {
      items: page.items.map((m) => ({
        id: m.id!,
        threadId: m.threadId,
        senderUserId: m.senderUserId,
        senderSide: m.senderSide,
        body: m.body,
        readAt: m.readAt ? m.readAt.toISOString() : null,
        createdAt: m.createdAt.toISOString(),
        attachments: (attachmentsByMessage.get(m.id!) ?? []).map((a) => ({
          id: a.id,
          fileName: a.fileName,
          contentType: a.contentType,
          sizeBytes: a.sizeBytes,
        })),
      })),
      nextCursor: page.nextCursor,
    };
  }
}

export class CountOpenSupportRequestsProjection {
  constructor(private readonly requests: SupportRequestRepositoryPort) {}

  async execute(): Promise<{ count: number }> {
    return { count: await this.requests.countOpen() };
  }
}
