import { describe, expect, it } from "bun:test";
import { Message } from "../../../bounded-contexts/communication/domain/aggregates/message.aggregate";
import { SupportRequestNotFoundError } from "../../../bounded-contexts/communication/domain/exceptions";
import type {
  MessagePage,
  MessageRepositoryPort,
} from "../../../bounded-contexts/communication/app/ports/outbound/message.repository.port";
import type { ThreadRepositoryPort } from "../../../bounded-contexts/communication/app/ports/outbound/thread.repository.port";
import type {
  SupportRequestFilter,
  SupportRequestListItem,
  SupportRequestPage,
  SupportRequestRepositoryPort,
} from "../../../bounded-contexts/communication/app/ports/outbound/support-request.repository.port";
import type { AttachmentRepositoryPort } from "../../../bounded-contexts/communication";
import type { AttachmentRow, ThreadRow } from "../../../shared/infrastructure/database/communication/schemas";
import type { ProviderNameReaderPort } from "../../communication/app/ports/outbound/provider-name-reader.port";
import type { CustomerNameReaderPort } from "../../communication/app/ports/outbound/customer-name-reader.port";
import type { ThreadPreviewReaderPort } from "../../communication/app/ports/outbound/thread-preview-reader.port";
import {
  CountOpenSupportRequestsProjection,
  GetSupportRequestProjection,
  ListSupportRequestMessagesProjection,
  ListSupportRequestsProjection,
} from "../app/use-cases/support-requests.projection";

const NOW = new Date("2026-08-20T09:00:00.000Z");

function message(props: Partial<Parameters<typeof Message.rehydrate>[0]> & { id: string; threadId: string }): Message {
  return Message.rehydrate({
    senderUserId: "u-customer",
    senderSide: "customer",
    body: "hi",
    readAt: null,
    notifyDueAt: null,
    notifiedAt: null,
    createdAt: NOW,
    ...props,
  });
}

const item = (over: Partial<SupportRequestListItem> = {}): SupportRequestListItem => ({
  threadId: "t1",
  audience: "customer",
  subject: "Reembolso",
  status: "open",
  bookingId: null,
  requesterUserId: "u1",
  providerId: null,
  lastMessageAt: NOW,
  createdAt: NOW,
  resolvedAt: null,
  ...over,
});

const emptyMessagePage: MessagePage = { items: [], nextCursor: null };
const emptySupportPage: SupportRequestPage = { items: [], nextCursor: null };

/**
 * Only `findSupportThread` is exercised by this slice — every other method
 * of the port belongs to the write side (or to `read/communication`'s
 * inbox), so it throws here the same way `read/communication`'s own
 * `FakeThreadRepository` throws for the methods it does not use.
 */
class FakeThreadRepository implements ThreadRepositoryPort {
  public readonly calls: string[] = [];
  private readonly supportThreads: Set<string>;

  constructor(options: { supportThreads?: Set<string> } = {}) {
    this.supportThreads = options.supportThreads ?? new Set();
  }

  async openOrFind(): Promise<never> {
    throw new Error("not used by the read side");
  }
  async openSupport(): Promise<never> {
    throw new Error("not used by the read side");
  }
  async touch(): Promise<void> {
    throw new Error("not used by the read side");
  }
  async findVisible(): Promise<never> {
    throw new Error("not used by the read side");
  }
  async listForCustomer(): Promise<never> {
    throw new Error("not used by the read side");
  }
  async listForProvider(): Promise<never> {
    throw new Error("not used by the read side");
  }
  /** Answers "yes" only for the ids it was seeded with — an inquiry id, or any other unseeded id, answers null just like a missing one. */
  async findSupportThread(threadId: string): Promise<ThreadRow | null> {
    this.calls.push(`findSupportThread:${threadId}`);
    if (!this.supportThreads.has(threadId)) return null;
    return {
      id: threadId,
      type: "support",
      customerUserId: "u1",
      providerId: null,
      lastMessageAt: NOW,
      createdAt: NOW,
    };
  }
}

class FakeMessageRepository implements MessageRepositoryPort {
  public readonly calls: string[] = [];
  constructor(
    private readonly page: MessagePage = emptyMessagePage,
    private readonly platformUnread: Map<string, number> = new Map(),
  ) {}

  async insert(): Promise<never> {
    throw new Error("not used by the read side");
  }
  async listForThread(threadId: string, limit: number, cursor: string | null): Promise<MessagePage> {
    this.calls.push(`listForThread:${threadId}:${limit}:${cursor ?? "none"}`);
    return this.page;
  }
  async markReadForViewer(): Promise<never> {
    throw new Error("not used by the read side");
  }
  async markReadForPlatform(): Promise<never> {
    throw new Error("not used by the read side");
  }
  async claimDueForNotice(): Promise<never[]> {
    throw new Error("not used by the read side");
  }
  async markNotified(): Promise<void> {
    throw new Error("not used by the read side");
  }
  async countUnreadForViewer(): Promise<never> {
    throw new Error("not used by the read side");
  }
  async countUnreadForPlatform(threadIds: string[]): Promise<Map<string, number>> {
    this.calls.push(`countUnreadForPlatform:[${threadIds.join(",")}]`);
    return this.platformUnread;
  }
}

/** Records every call, so a test can prove a page is enriched with exactly ONE batched call, not one per message. */
class FakeAttachmentRepository implements AttachmentRepositoryPort {
  public readonly calls: string[][] = [];
  constructor(private readonly byMessage: Map<string, AttachmentRow[]> = new Map()) {}

  async insertMany(): Promise<void> {
    throw new Error("not used by the read side");
  }
  async listForMessages(messageIds: string[]): Promise<Map<string, AttachmentRow[]>> {
    this.calls.push([...messageIds]);
    return this.byMessage;
  }
  async findVisible(): Promise<AttachmentRow | null> {
    throw new Error("not used by the read side");
  }
  async findOnSupportThread(): Promise<AttachmentRow | null> {
    throw new Error("not used by the read side");
  }
}

/**
 * Records the exact arguments `listForAdmin` was called with, not just that
 * a call happened — a fixture that ignored its arguments could not tell "the
 * filter and the clamped limit reached the repository" apart from "the
 * projection dropped them on the floor".
 */
class FakeSupportRequestRepository implements SupportRequestRepositoryPort {
  public readonly listCalls: { filter: SupportRequestFilter; limit: number; cursor: string | null }[] = [];

  constructor(
    private readonly page: SupportRequestPage = emptySupportPage,
    private readonly itemsById: Map<string, SupportRequestListItem> = new Map(),
    private readonly openCount = 0,
  ) {}

  async insert(): Promise<void> {
    throw new Error("not used by the read side");
  }
  async findByThreadId(): Promise<never> {
    throw new Error("not used by the read side");
  }
  async findByThreadIds(): Promise<never> {
    throw new Error("not used by the read side");
  }
  async save(): Promise<void> {
    throw new Error("not used by the read side");
  }
  async countOpenForRequester(): Promise<never> {
    throw new Error("not used by the read side");
  }
  async listForAdmin(filter: SupportRequestFilter, limit: number, cursor: string | null): Promise<SupportRequestPage> {
    this.listCalls.push({ filter, limit, cursor });
    return this.page;
  }
  async findListItem(threadId: string): Promise<SupportRequestListItem | null> {
    return this.itemsById.get(threadId) ?? null;
  }
  async countOpen(): Promise<number> {
    return this.openCount;
  }
}

class FakeProviderNameReader implements ProviderNameReaderPort {
  public readonly calls: string[][] = [];
  /** Every id asked for, across every call, flattened — a row with a null provider must never add one here. */
  public readonly askedFor: string[] = [];
  constructor(private readonly names: Map<string, string> = new Map()) {}
  async findNamesByIds(providerIds: string[]): Promise<Map<string, string>> {
    this.calls.push([...providerIds]);
    this.askedFor.push(...providerIds);
    return this.names;
  }
}

class FakeCustomerNameReader implements CustomerNameReaderPort {
  public readonly calls: string[][] = [];
  constructor(private readonly names: Map<string, string> = new Map()) {}
  async findNamesByIds(customerUserIds: string[]): Promise<Map<string, string>> {
    this.calls.push([...customerUserIds]);
    return this.names;
  }
}

class FakeThreadPreviewReader implements ThreadPreviewReaderPort {
  public readonly calls: string[][] = [];
  constructor(private readonly bodies: Map<string, { body: string; hasAttachment: boolean }> = new Map()) {}
  async findLastMessageBodies(threadIds: string[]): Promise<Map<string, { body: string; hasAttachment: boolean }>> {
    this.calls.push([...threadIds]);
    return this.bodies;
  }
}

describe("ListSupportRequestsProjection", () => {
  it("passes filters, clamps the limit, and enriches every row with one batched call each", async () => {
    const requests = new FakeSupportRequestRepository({
      items: [item(), item({ threadId: "t2", audience: "provider", providerId: "p1", requesterUserId: "u2" })],
      nextCursor: "c",
    });
    const messages = new FakeMessageRepository(emptyMessagePage, new Map([["t1", 3]]));
    const providerNames = new FakeProviderNameReader(new Map([["p1", "Salão X"]]));
    const customerNames = new FakeCustomerNameReader(
      new Map([
        ["u1", "Ana"],
        ["u2", "Bruno"],
      ]),
    );
    const previews = new FakeThreadPreviewReader(new Map([["t1", { body: "Paguei duas vezes", hasAttachment: false }]]));
    const projection = new ListSupportRequestsProjection(requests, messages, providerNames, customerNames, previews);

    const page = await projection.execute({ status: "open", audience: undefined, limit: 500, cursor: null });

    expect(requests.listCalls).toEqual([{ filter: { status: "open", audience: undefined }, limit: 50, cursor: null }]);
    expect(messages.calls).toEqual(["countUnreadForPlatform:[t1,t2]"]);
    expect(page.nextCursor).toBe("c");
    expect(page.items[0]).toMatchObject({
      threadId: "t1",
      requesterName: "Ana",
      providerName: "",
      unreadForAdmin: 3,
      lastMessagePreview: "Paguei duas vezes",
      lastMessageAt: NOW.toISOString(),
      resolvedAt: null,
    });
    expect(page.items[1]).toMatchObject({
      threadId: "t2",
      requesterName: "Bruno",
      providerId: "p1",
      providerName: "Salão X",
      unreadForAdmin: 0,
      lastMessagePreview: "",
    });
    expect(providerNames.askedFor).toEqual(["p1"]);
  });

  it("does not call the enrichment ports at all on an empty page", async () => {
    const requests = new FakeSupportRequestRepository(emptySupportPage);
    const messages = new FakeMessageRepository();
    const providerNames = new FakeProviderNameReader();
    const customerNames = new FakeCustomerNameReader();
    const previews = new FakeThreadPreviewReader();
    const projection = new ListSupportRequestsProjection(requests, messages, providerNames, customerNames, previews);

    const page = await projection.execute({});

    expect(page).toEqual({ items: [], nextCursor: null });
    expect(messages.calls).toEqual([]);
    expect(providerNames.calls).toEqual([]);
    expect(customerNames.calls).toEqual([]);
    expect(previews.calls).toEqual([]);
  });
});

describe("GetSupportRequestProjection", () => {
  it("returns one enriched row, or refuses as not found", async () => {
    const requests = new FakeSupportRequestRepository(emptySupportPage, new Map([["t1", item()]]));
    const providerNames = new FakeProviderNameReader();
    const customerNames = new FakeCustomerNameReader();
    const previews = new FakeThreadPreviewReader();
    const projection = new GetSupportRequestProjection(
      requests,
      new FakeMessageRepository(),
      providerNames,
      customerNames,
      previews,
    );

    expect((await projection.execute({ threadId: "t1" })).threadId).toBe("t1");
    await expect(projection.execute({ threadId: "nope" })).rejects.toBeInstanceOf(SupportRequestNotFoundError);
  });
});

describe("ListSupportRequestMessagesProjection", () => {
  it("reads through findSupportThread, never findVisible, and refuses an inquiry", async () => {
    const threads = new FakeThreadRepository({ supportThreads: new Set(["t1"]) });
    const messages = new FakeMessageRepository({
      items: [message({ id: "m1", threadId: "t1", senderSide: "customer" })],
      nextCursor: null,
    });
    const projection = new ListSupportRequestMessagesProjection(threads, messages, new FakeAttachmentRepository());

    const page = await projection.execute({ threadId: "t1" });
    expect(page.items[0]).toMatchObject({ id: "m1", senderSide: "customer", attachments: [] });
    expect(threads.calls).toEqual(["findSupportThread:t1"]);
    await expect(projection.execute({ threadId: "inquiry-1" })).rejects.toBeInstanceOf(SupportRequestNotFoundError);
  });

  it("carries a message's attachments, resolved in one batched call", async () => {
    const threads = new FakeThreadRepository({ supportThreads: new Set(["t1"]) });
    const page: MessagePage = {
      items: [
        message({ id: "m1", threadId: "t1", senderSide: "platform" }),
        message({ id: "m2", threadId: "t1", senderSide: "customer" }),
      ],
      nextCursor: "cursor-1",
    };
    const messages = new FakeMessageRepository(page);
    const row: AttachmentRow = {
      id: "a1",
      messageId: "m1",
      storageKey: "attachment/u1/123",
      fileName: "orcamento.pdf",
      contentType: "application/pdf",
      sizeBytes: 1024,
      createdAt: NOW,
    };
    const attachments = new FakeAttachmentRepository(new Map([["m1", [row]]]));
    const projection = new ListSupportRequestMessagesProjection(threads, messages, attachments);

    const result = await projection.execute({ threadId: "t1" });

    expect(attachments.calls).toEqual([["m1", "m2"]]);
    expect(result.items[0]!.attachments).toEqual([
      { id: "a1", fileName: "orcamento.pdf", contentType: "application/pdf", sizeBytes: 1024 },
    ]);
    expect(result.items[1]!.attachments).toEqual([]);
    expect(result.nextCursor).toBe("cursor-1");
  });
});

describe("CountOpenSupportRequestsProjection", () => {
  it("is the repository's count", async () => {
    const requests = new FakeSupportRequestRepository(emptySupportPage, new Map(), 7);
    expect(await new CountOpenSupportRequestsProjection(requests).execute()).toEqual({ count: 7 });
  });
});
