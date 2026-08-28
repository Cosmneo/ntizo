import { describe, expect, it } from "bun:test";
import { Thread } from "../../../bounded-contexts/communication/domain/aggregates/thread.aggregate";
import { Message } from "../../../bounded-contexts/communication/domain/aggregates/message.aggregate";
import { ThreadNotVisibleError } from "../../../bounded-contexts/communication/domain/exceptions";
import type {
  ThreadPage,
  ThreadRepositoryPort,
} from "../../../bounded-contexts/communication/app/ports/outbound/thread.repository.port";
import type {
  MessagePage,
  MessageRepositoryPort,
} from "../../../bounded-contexts/communication/app/ports/outbound/message.repository.port";
import type { ProviderReaderPort } from "../../../bounded-contexts/communication/app/ports/outbound/provider-reader.port";
import type { AttachmentRepositoryPort } from "../../../bounded-contexts/communication";
import type { AttachmentRow } from "../../../shared/infrastructure/database/communication/schemas";
import type { ProviderNameReaderPort } from "../app/ports/outbound/provider-name-reader.port";
import type { CustomerNameReaderPort } from "../app/ports/outbound/customer-name-reader.port";
import type { ThreadPreviewReaderPort } from "../app/ports/outbound/thread-preview-reader.port";
import {
  ListMyThreadsProjection,
  ListProviderThreadsProjection,
  ListThreadMessagesProjection,
} from "../app/use-cases/conversations.projection";

function thread(props: Partial<Parameters<typeof Thread.rehydrate>[0]> & { id: string; providerId: string }): Thread {
  return Thread.rehydrate({
    type: "inquiry",
    customerUserId: "u-customer",
    lastMessageAt: new Date("2026-08-20T09:00:00.000Z"),
    createdAt: new Date("2026-08-20T09:00:00.000Z"),
    ...props,
  });
}

function message(props: Partial<Parameters<typeof Message.rehydrate>[0]> & { id: string; threadId: string }): Message {
  return Message.rehydrate({
    senderUserId: "u-customer",
    body: "hi",
    readAt: null,
    notifyDueAt: null,
    notifiedAt: null,
    createdAt: new Date("2026-08-20T09:00:00.000Z"),
    ...props,
  });
}

const emptyThreadPage: ThreadPage = { items: [], nextCursor: null };
const emptyMessagePage: MessagePage = { items: [], nextCursor: null };

/** Records every call, including the exact arguments, not just that a call happened. */
class FakeThreadRepository implements ThreadRepositoryPort {
  public readonly calls: string[] = [];
  constructor(
    private readonly page: ThreadPage = emptyThreadPage,
    private readonly visible: Record<string, boolean> = {},
  ) {}

  async openOrFind(): Promise<never> {
    throw new Error("not used by the read side");
  }
  async touch(): Promise<void> {
    throw new Error("not used by the read side");
  }
  async findVisible(threadId: string, viewerUserId: string) {
    this.calls.push(`findVisible:${threadId}:${viewerUserId}`);
    return this.visible[`${threadId}:${viewerUserId}`]
      ? ({ id: threadId } as never)
      : null;
  }
  async listForCustomer(customerUserId: string, limit: number, cursor: string | null): Promise<ThreadPage> {
    this.calls.push(`listForCustomer:${customerUserId}:${limit}:${cursor ?? "none"}`);
    return this.page;
  }
  async listForProvider(providerId: string, limit: number, cursor: string | null): Promise<ThreadPage> {
    this.calls.push(`listForProvider:${providerId}:${limit}:${cursor ?? "none"}`);
    return this.page;
  }
}

class FakeMessageRepository implements MessageRepositoryPort {
  public readonly calls: string[] = [];
  constructor(
    private readonly page: MessagePage = emptyMessagePage,
    private readonly unread: Map<string, number> = new Map(),
  ) {}

  async insert(): Promise<string> {
    throw new Error("not used by the read side");
  }
  async listForThread(threadId: string, limit: number, cursor: string | null): Promise<MessagePage> {
    this.calls.push(`listForThread:${threadId}:${limit}:${cursor ?? "none"}`);
    return this.page;
  }
  async markReadForViewer(): Promise<number> {
    throw new Error("not used by the read side");
  }
  async claimDueForNotice(): Promise<never[]> {
    throw new Error("not used by the read side");
  }
  async markNotified(): Promise<void> {
    throw new Error("not used by the read side");
  }
  async countUnreadForViewer(threadIds: string[], viewerUserId: string): Promise<Map<string, number>> {
    this.calls.push(`countUnreadForViewer:[${threadIds.join(",")}]:${viewerUserId}`);
    return this.unread;
  }
}

/** Records every call and counts them, so a test can prove a page is enriched with exactly ONE batched call, not one per message. */
class FakeAttachmentRepository implements AttachmentRepositoryPort {
  public readonly calls: string[][] = [];
  constructor(private readonly byMessage: Map<string, AttachmentRow[]> = new Map()) {}

  get listCallCount(): number {
    return this.calls.length;
  }

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
}

/**
 * Can only answer "yes" for the exact pair it was built with — a fixture
 * that returned `true` unconditionally would pass whether or not
 * `ListProviderThreadsProjection` actually checks membership, which is
 * exactly the defect this project's follow-ups keep naming. A second user,
 * `"u-stranger"`, is the one this file uses to prove the check is real.
 */
class FakeProviderReader implements ProviderReaderPort {
  public readonly calls: string[] = [];
  constructor(private readonly member: { providerId: string; userId: string } | null) {}

  async isContactable(): Promise<boolean> {
    throw new Error("not used by the read side");
  }
  async isMember(providerId: string, userId: string): Promise<boolean> {
    this.calls.push(`isMember:${providerId}:${userId}`);
    return this.member !== null && this.member.providerId === providerId && this.member.userId === userId;
  }
}

class FakeProviderNameReader implements ProviderNameReaderPort {
  public readonly calls: string[][] = [];
  constructor(private readonly names: Map<string, string> = new Map()) {}
  async findNamesByIds(providerIds: string[]): Promise<Map<string, string>> {
    this.calls.push([...providerIds]);
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
  constructor(private readonly bodies: Map<string, string> = new Map()) {}
  async findLastMessageBodies(threadIds: string[]): Promise<Map<string, string>> {
    this.calls.push([...threadIds]);
    return this.bodies;
  }
}

describe("ListMyThreadsProjection", () => {
  it("defaults the page size rather than trusting the caller", async () => {
    const threads = new FakeThreadRepository();
    const messages = new FakeMessageRepository();
    const names = new FakeProviderNameReader();
    const customerNames = new FakeCustomerNameReader();
    const previews = new FakeThreadPreviewReader();
    await new ListMyThreadsProjection(threads, messages, names, customerNames, previews).execute({
      requesterUserId: "u1",
    });
    expect(threads.calls).toEqual(["listForCustomer:u1:20:none"]);
  });

  it("clamps a limit nobody should ask for", async () => {
    const threads = new FakeThreadRepository();
    const messages = new FakeMessageRepository();
    const names = new FakeProviderNameReader();
    const customerNames = new FakeCustomerNameReader();
    const previews = new FakeThreadPreviewReader();
    await new ListMyThreadsProjection(threads, messages, names, customerNames, previews).execute({
      requesterUserId: "u1",
      limit: 5000,
    });
    expect(threads.calls).toEqual(["listForCustomer:u1:50:none"]);
  });

  it("floors a limit of zero or below to 1", async () => {
    const threads = new FakeThreadRepository();
    const messages = new FakeMessageRepository();
    const names = new FakeProviderNameReader();
    const customerNames = new FakeCustomerNameReader();
    const previews = new FakeThreadPreviewReader();
    await new ListMyThreadsProjection(threads, messages, names, customerNames, previews).execute({
      requesterUserId: "u1",
      limit: 0,
    });
    expect(threads.calls).toEqual(["listForCustomer:u1:1:none"]);
  });

  it("reads only the caller's own inbox — the actor is the session's user, never an argument", async () => {
    const threads = new FakeThreadRepository();
    const messages = new FakeMessageRepository();
    const names = new FakeProviderNameReader();
    const customerNames = new FakeCustomerNameReader();
    const previews = new FakeThreadPreviewReader();
    await new ListMyThreadsProjection(threads, messages, names, customerNames, previews).execute({
      requesterUserId: "u9",
    });
    expect(threads.calls).toEqual(["listForCustomer:u9:20:none"]);
  });

  it("passes the caller's cursor straight through, and a null cursor when none was given", async () => {
    const threads = new FakeThreadRepository();
    const messages = new FakeMessageRepository();
    const names = new FakeProviderNameReader();
    const customerNames = new FakeCustomerNameReader();
    const previews = new FakeThreadPreviewReader();
    await new ListMyThreadsProjection(threads, messages, names, customerNames, previews).execute({
      requesterUserId: "u1",
      cursor: "2026-08-20T09:00:00.000Z|t1",
    });
    expect(threads.calls).toEqual(["listForCustomer:u1:20:2026-08-20T09:00:00.000Z|t1"]);
  });

  it(
    "enriches a page of two threads with exactly ONE batched call each for names, previews and " +
      "unread counts — never one call per row",
    async () => {
      const twoThreads: ThreadPage = {
        items: [
          thread({
            id: "t1",
            providerId: "p1",
            customerUserId: "u-customer-1",
            lastMessageAt: new Date("2026-08-21T09:00:00.000Z"),
          }),
          thread({
            id: "t2",
            providerId: "p2",
            customerUserId: "u-customer-2",
            lastMessageAt: new Date("2026-08-20T09:00:00.000Z"),
          }),
        ],
        nextCursor: "2026-08-20T09:00:00.000Z|t2",
      };
      const threads = new FakeThreadRepository(twoThreads);
      const messages = new FakeMessageRepository(
        emptyMessagePage,
        new Map([
          ["t1", 3],
          // t2 deliberately absent — countUnreadForViewer's contract is
          // "absent means zero", not "every thread gets an entry".
        ]),
      );
      const names = new FakeProviderNameReader(new Map([["p1", "Salão X"]]));
      // Same "one row's lookup misses, the other's does not" shape
      // `names` above already has — `u-customer-2` deliberately absent, so
      // this also proves `customerName` degrades to "" per row, not
      // per-page.
      const customerNames = new FakeCustomerNameReader(new Map([["u-customer-1", "Ana Silva"]]));
      const previews = new FakeThreadPreviewReader(new Map([["t1", "See you tomorrow"]]));

      const result = await new ListMyThreadsProjection(threads, messages, names, customerNames, previews).execute({
        requesterUserId: "u1",
      });

      // One call each, carrying every id on the page — not two calls, one per row.
      expect(messages.calls).toEqual(["countUnreadForViewer:[t1,t2]:u1"]);
      expect(names.calls).toEqual([["p1", "p2"]]);
      expect(customerNames.calls).toEqual([["u-customer-1", "u-customer-2"]]);
      expect(previews.calls).toEqual([["t1", "t2"]]);

      expect(result).toEqual({
        items: [
          {
            id: "t1",
            providerId: "p1",
            providerName: "Salão X",
            customerName: "Ana Silva",
            lastMessageAt: "2026-08-21T09:00:00.000Z",
            lastMessagePreview: "See you tomorrow",
            unreadCount: 3,
          },
          {
            id: "t2",
            providerId: "p2",
            // Missed by every lookup — degrades to empty/zero, not an error.
            providerName: "",
            customerName: "",
            lastMessageAt: "2026-08-20T09:00:00.000Z",
            lastMessagePreview: "",
            unreadCount: 0,
          },
        ],
        nextCursor: "2026-08-20T09:00:00.000Z|t2",
      });
    },
  );

  it("does not call the enrichment ports at all on an empty page", async () => {
    const threads = new FakeThreadRepository(emptyThreadPage);
    const messages = new FakeMessageRepository();
    const names = new FakeProviderNameReader();
    const customerNames = new FakeCustomerNameReader();
    const previews = new FakeThreadPreviewReader();
    const result = await new ListMyThreadsProjection(threads, messages, names, customerNames, previews).execute({
      requesterUserId: "u1",
    });
    expect(result).toEqual({ items: [], nextCursor: null });
    expect(messages.calls).toEqual([]);
    expect(names.calls).toEqual([]);
    expect(customerNames.calls).toEqual([]);
    expect(previews.calls).toEqual([]);
  });
});

describe("ListProviderThreadsProjection", () => {
  it("refuses a non-member before reading anything", async () => {
    const threads = new FakeThreadRepository();
    const messages = new FakeMessageRepository();
    const providers = new FakeProviderReader({ providerId: "p1", userId: "u-owner" });
    const names = new FakeProviderNameReader();
    const customerNames = new FakeCustomerNameReader();
    const previews = new FakeThreadPreviewReader();

    await expect(
      new ListProviderThreadsProjection(threads, messages, providers, names, customerNames, previews).execute({
        requesterUserId: "u-stranger",
        providerId: "p1",
      }),
    ).rejects.toThrow(ThreadNotVisibleError);

    expect(providers.calls).toEqual(["isMember:p1:u-stranger"]);
    // The check runs before any thread is read.
    expect(threads.calls).toEqual([]);
    expect(messages.calls).toEqual([]);
  });

  it("gets a real member their page, after the membership check passes for that exact pair", async () => {
    const page: ThreadPage = {
      items: [thread({ id: "t1", providerId: "p1", customerUserId: "u-customer-1" })],
      nextCursor: null,
    };
    const threads = new FakeThreadRepository(page);
    const messages = new FakeMessageRepository(emptyMessagePage, new Map([["t1", 1]]));
    const providers = new FakeProviderReader({ providerId: "p1", userId: "u-owner" });
    const names = new FakeProviderNameReader(new Map([["p1", "Salão X"]]));
    // `Ana Silva` is who this workspace's inbox exists to name — a provider
    // member reading their own list needs to know which customer each row
    // is with, and `providerName` (their own workspace's name) cannot say
    // that; only `customerName` can. See `ProviderMessagesPage`'s own doc
    // comment on the frontend side of this same requirement.
    const customerNames = new FakeCustomerNameReader(new Map([["u-customer-1", "Ana Silva"]]));
    const previews = new FakeThreadPreviewReader(new Map([["t1", "hi"]]));

    const result = await new ListProviderThreadsProjection(threads, messages, providers, names, customerNames, previews).execute({
      requesterUserId: "u-owner",
      providerId: "p1",
    });

    expect(providers.calls).toEqual(["isMember:p1:u-owner"]);
    expect(threads.calls).toEqual(["listForProvider:p1:20:none"]);
    expect(customerNames.calls).toEqual([["u-customer-1"]]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: "t1",
      providerName: "Salão X",
      customerName: "Ana Silva",
      unreadCount: 1,
    });
  });

  // The same provider, two different requesters. A fixture holding only
  // one person's membership cannot tell "the check runs" apart from "the
  // check is missing and everyone happens to pass" — this can, because
  // `u-owner` and `u-stranger` get different, opposite answers from the
  // exact same call.
  it("a member of the provider and a stranger to it get opposite answers for the identical request", async () => {
    const page: ThreadPage = { items: [], nextCursor: null };
    const threads = new FakeThreadRepository(page);
    const messages = new FakeMessageRepository();
    const providers = new FakeProviderReader({ providerId: "p1", userId: "u-owner" });
    const names = new FakeProviderNameReader();
    const customerNames = new FakeCustomerNameReader();
    const previews = new FakeThreadPreviewReader();
    const projection = new ListProviderThreadsProjection(threads, messages, providers, names, customerNames, previews);

    await expect(
      projection.execute({ requesterUserId: "u-owner", providerId: "p1" }),
    ).resolves.toEqual({ items: [], nextCursor: null });

    await expect(
      projection.execute({ requesterUserId: "u-stranger", providerId: "p1" }),
    ).rejects.toThrow(ThreadNotVisibleError);
  });

  it("clamps and paginates the same way the customer inbox does", async () => {
    const threads = new FakeThreadRepository();
    const messages = new FakeMessageRepository();
    const providers = new FakeProviderReader({ providerId: "p1", userId: "u-owner" });
    const names = new FakeProviderNameReader();
    const customerNames = new FakeCustomerNameReader();
    const previews = new FakeThreadPreviewReader();
    await new ListProviderThreadsProjection(threads, messages, providers, names, customerNames, previews).execute({
      requesterUserId: "u-owner",
      providerId: "p1",
      limit: 5000,
      cursor: "2026-08-20T09:00:00.000Z|t1",
    });
    expect(threads.calls).toEqual(["listForProvider:p1:50:2026-08-20T09:00:00.000Z|t1"]);
  });
});

describe("ListThreadMessagesProjection", () => {
  it("refuses an invisible thread before reading any messages", async () => {
    const threads = new FakeThreadRepository(emptyThreadPage, {});
    const messages = new FakeMessageRepository();
    const attachments = new FakeAttachmentRepository();

    await expect(
      new ListThreadMessagesProjection(threads, messages, attachments).execute({
        requesterUserId: "u-stranger",
        threadId: "t1",
      }),
    ).rejects.toThrow(ThreadNotVisibleError);

    expect(threads.calls).toEqual(["findVisible:t1:u-stranger"]);
    expect(messages.calls).toEqual([]);
    expect(attachments.calls).toEqual([]);
  });

  it("lists a visible thread's messages, paged", async () => {
    const threads = new FakeThreadRepository(emptyThreadPage, { "t1:u-customer": true });
    const page: MessagePage = {
      items: [
        message({
          id: "m2",
          threadId: "t1",
          senderUserId: "u-provider-staff",
          body: "See you tomorrow",
          createdAt: new Date("2026-08-21T09:05:00.000Z"),
        }),
        message({
          id: "m1",
          threadId: "t1",
          senderUserId: "u-customer",
          body: "Hi, are you free?",
          readAt: new Date("2026-08-21T09:01:00.000Z"),
          createdAt: new Date("2026-08-21T09:00:00.000Z"),
        }),
      ],
      nextCursor: "2026-08-21T09:00:00.000Z|m1",
    };
    const messages = new FakeMessageRepository(page);
    // Neither row appears in the attachment map — both must degrade to
    // `[]`, not `undefined`, the same convention `unreadCount` uses for 0.
    const attachments = new FakeAttachmentRepository();

    const result = await new ListThreadMessagesProjection(threads, messages, attachments).execute({
      requesterUserId: "u-customer",
      threadId: "t1",
    });

    expect(threads.calls).toEqual(["findVisible:t1:u-customer"]);
    expect(messages.calls).toEqual(["listForThread:t1:20:none"]);
    expect(attachments.calls).toEqual([["m2", "m1"]]);
    // Two rows, not one — a fixture with a single item cannot tell a
    // correct page apart from one truncated to its first row (or reversed).
    expect(result).toEqual({
      items: [
        {
          id: "m2",
          threadId: "t1",
          senderUserId: "u-provider-staff",
          body: "See you tomorrow",
          readAt: null,
          createdAt: "2026-08-21T09:05:00.000Z",
          attachments: [],
        },
        {
          id: "m1",
          threadId: "t1",
          senderUserId: "u-customer",
          body: "Hi, are you free?",
          readAt: "2026-08-21T09:01:00.000Z",
          createdAt: "2026-08-21T09:00:00.000Z",
          attachments: [],
        },
      ],
      nextCursor: "2026-08-21T09:00:00.000Z|m1",
    });
  });

  it("carries a message's attachments", async () => {
    const threads = new FakeThreadRepository(emptyThreadPage, { "t1:u-customer": true });
    const page: MessagePage = {
      items: [
        message({
          id: "m1",
          threadId: "t1",
          senderUserId: "u-provider-staff",
          body: "Aqui está o orçamento",
        }),
      ],
      nextCursor: null,
    };
    const messages = new FakeMessageRepository(page);
    const row: AttachmentRow = {
      id: "a1",
      messageId: "m1",
      storageKey: "attachment/u-provider-staff/123-uuid",
      fileName: "orcamento.pdf",
      contentType: "application/pdf",
      sizeBytes: 1024,
      createdAt: new Date("2026-08-21T09:00:00.000Z"),
    };
    const attachments = new FakeAttachmentRepository(new Map([["m1", [row]]]));

    const result = await new ListThreadMessagesProjection(threads, messages, attachments).execute({
      requesterUserId: "u-customer",
      threadId: "t1",
    });

    // `storageKey` and `createdAt` are deliberately absent from the wire
    // shape — see `messageAttachmentReadModel`'s own doc comment.
    expect(result.items[0]!.attachments).toEqual([
      { id: "a1", fileName: "orcamento.pdf", contentType: "application/pdf", sizeBytes: 1024 },
    ]);
  });

  it("asks for a page of messages' attachments in one call, not one per message", async () => {
    const threads = new FakeThreadRepository(emptyThreadPage, { "t1:u-customer": true });
    const page: MessagePage = {
      items: [
        message({ id: "m2", threadId: "t1", senderUserId: "u-provider-staff" }),
        message({ id: "m1", threadId: "t1", senderUserId: "u-customer" }),
      ],
      nextCursor: null,
    };
    const messages = new FakeMessageRepository(page);
    const attachments = new FakeAttachmentRepository();

    await new ListThreadMessagesProjection(threads, messages, attachments).execute({
      requesterUserId: "u-customer",
      threadId: "t1",
    });

    expect(attachments.listCallCount).toBe(1);
    expect(attachments.calls).toEqual([["m2", "m1"]]);
  });

  it("clamps the limit and passes the cursor through", async () => {
    const threads = new FakeThreadRepository(emptyThreadPage, { "t1:u1": true });
    const messages = new FakeMessageRepository();
    const attachments = new FakeAttachmentRepository();
    await new ListThreadMessagesProjection(threads, messages, attachments).execute({
      requesterUserId: "u1",
      threadId: "t1",
      limit: 0,
      cursor: "2026-08-20T09:00:00.000Z|m9",
    });
    expect(messages.calls).toEqual(["listForThread:t1:1:2026-08-20T09:00:00.000Z|m9"]);
  });
});
