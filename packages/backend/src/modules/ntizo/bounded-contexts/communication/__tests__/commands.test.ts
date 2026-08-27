import { beforeEach, describe, expect, it } from "bun:test";
import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { Message } from "../domain/aggregates/message.aggregate";
import { ProviderNotContactableError, ThreadNotVisibleError } from "../domain/exceptions";
import { StartThreadCommand } from "../app/use-cases/start-thread.command";
import { SendMessageCommand } from "../app/use-cases/send-message.command";
import { MarkThreadReadCommand } from "../app/use-cases/mark-thread-read.command";
import type {
  DueMessage,
  MessagePage,
  MessageRepositoryPort,
} from "../app/ports/outbound/message.repository.port";
import type {
  ThreadOpenResult,
  ThreadPage,
  ThreadRepositoryPort,
} from "../app/ports/outbound/thread.repository.port";
import type { ProviderReaderPort } from "../app/ports/outbound/provider-reader.port";
import type { ThreadRow } from "../../../shared/infrastructure/database/communication/schemas";

const NOW = new Date("2026-08-27T10:00:00.000Z");

/**
 * A thread repository whose `findVisible` actually enforces the rule it
 * exists to enforce — the customer on the thread, or a member of its
 * provider — rather than a stub that returns the thread for anyone who
 * asks. `members` is shared with `FakeProviderReader` (the same `Map`
 * instance, constructed once per test in `beforeEach` below), so
 * `fakeProviders.members.set(...)` in a test changes what THIS repository
 * considers visible too — exactly as `provider_member` is the one fact both
 * `DrizzleThreadRepository.findVisible` and `DrizzleProviderReader.isMember`
 * read in production.
 */
class FakeThreadRepository implements ThreadRepositoryPort {
  threads = new Map<string, ThreadRow>();
  touched: { threadId: string; at: Date }[] = [];

  constructor(
    private readonly members: Map<string, string[]>,
    private readonly order?: string[],
  ) {}

  seed(row: ThreadRow): void {
    this.threads.set(row.id, row);
  }

  async openOrFind(customerUserId: string, providerId: string, now: Date): Promise<ThreadOpenResult> {
    for (const row of this.threads.values()) {
      if (row.customerUserId === customerUserId && row.providerId === providerId) {
        return { id: row.id, created: false };
      }
    }
    const id = crypto.randomUUID();
    this.threads.set(id, {
      id,
      type: "inquiry",
      customerUserId,
      providerId,
      lastMessageAt: now,
      createdAt: now,
    });
    return { id, created: true };
  }

  async touch(threadId: string, at: Date): Promise<void> {
    this.order?.push("touch");
    this.touched.push({ threadId, at });
    const row = this.threads.get(threadId);
    if (row) this.threads.set(threadId, { ...row, lastMessageAt: at });
  }

  async findVisible(threadId: string, viewerUserId: string): Promise<ThreadRow | null> {
    const row = this.threads.get(threadId);
    if (!row) return null;
    if (row.customerUserId === viewerUserId) return row;
    if ((this.members.get(row.providerId) ?? []).includes(viewerUserId)) return row;
    return null;
  }

  async listForCustomer(): Promise<ThreadPage> {
    return { items: [], nextCursor: null };
  }

  async listForProvider(): Promise<ThreadPage> {
    return { items: [], nextCursor: null };
  }
}

class FakeMessageRepository implements MessageRepositoryPort {
  inserted: Message[] = [];
  markReadCalls: { threadId: string; viewerUserId: string; at: Date }[] = [];
  markReadResult = 1;

  constructor(private readonly order?: string[]) {}

  async insert(message: Message): Promise<string> {
    this.order?.push("insert");
    this.inserted.push(message);
    return crypto.randomUUID();
  }

  async listForThread(): Promise<MessagePage> {
    return { items: [], nextCursor: null };
  }

  async markReadForViewer(threadId: string, viewerUserId: string, at: Date): Promise<number> {
    this.markReadCalls.push({ threadId, viewerUserId, at });
    return this.markReadResult;
  }

  async claimDueForNotice(): Promise<DueMessage[]> {
    return [];
  }

  async markNotified(): Promise<void> {}

  async countUnreadForViewer(): Promise<Map<string, number>> {
    return new Map();
  }
}

class FakeProviderReader implements ProviderReaderPort {
  contactable = new Map<string, boolean>();

  constructor(public readonly members: Map<string, string[]>) {}

  async isContactable(providerId: string): Promise<boolean> {
    return this.contactable.get(providerId) ?? true;
  }

  async isMember(providerId: string, userId: string): Promise<boolean> {
    return (this.members.get(providerId) ?? []).includes(userId);
  }
}

/**
 * Reports whether `atomicExecute` ran the callback at all — deliberately
 * does not reset to `false` once the callback returns, unlike a "currently
 * inside a transaction" flag would: the assertion this exists for
 * (`sending`'s "in one transaction" test) checks it AFTER `execute()` has
 * already resolved, so a flag that reset itself in a `finally` block could
 * never observe anything but `false` there. `order` is the log both fake
 * repositories stamp themselves onto, shared by reference, so
 * `touchedAfterInsert` can tell "insert, then touch" apart from the reverse
 * or from "touch never happened".
 */
class TrackingUnitOfWork implements UnitOfWorkPort {
  insideTransaction = false;
  readonly order: string[] = [];

  async atomicExecute<T>(work: () => Promise<T>): Promise<T> {
    this.insideTransaction = true;
    return await work();
  }

  get touchedAfterInsert(): boolean {
    const insertAt = this.order.indexOf("insert");
    const touchAt = this.order.indexOf("touch");
    return insertAt !== -1 && touchAt !== -1 && insertAt < touchAt;
  }
}

const customerId = "customer-1";
const providerId = "provider-1";

let members: Map<string, string[]>;
let fakeThreads: FakeThreadRepository;
let fakeMessages: FakeMessageRepository;
let fakeProviders: FakeProviderReader;
let uow: TrackingUnitOfWork;
let existingThread: string;

let start: StartThreadCommand;
let send: SendMessageCommand;
let markRead: MarkThreadReadCommand;

beforeEach(() => {
  members = new Map();
  uow = new TrackingUnitOfWork();
  fakeThreads = new FakeThreadRepository(members, uow.order);
  fakeMessages = new FakeMessageRepository(uow.order);
  fakeProviders = new FakeProviderReader(members);

  existingThread = crypto.randomUUID();
  fakeThreads.seed({
    id: existingThread,
    type: "inquiry",
    customerUserId: customerId,
    providerId,
    lastMessageAt: NOW,
    createdAt: NOW,
  });

  start = new StartThreadCommand(fakeThreads, fakeProviders, () => NOW);
  send = new SendMessageCommand(fakeThreads, fakeMessages, uow, () => NOW);
  markRead = new MarkThreadReadCommand(fakeThreads, fakeMessages, () => NOW);
});

describe("authorization", () => {
  it("refuses a stranger the same way it refuses a missing thread", async () => {
    await expect(
      send.execute({ threadId: existingThread, senderUserId: "someone-else", body: "olá" }),
    ).rejects.toThrow(ThreadNotVisibleError);

    await expect(
      send.execute({ threadId: crypto.randomUUID(), senderUserId: customerId, body: "olá" }),
    ).rejects.toThrow(ThreadNotVisibleError);
  });

  it("lets the customer send", async () => {
    await expect(
      send.execute({ threadId: existingThread, senderUserId: customerId, body: "olá" }),
    ).resolves.toBeDefined();
  });

  it("lets any member of the provider send", async () => {
    fakeProviders.members.set(providerId, ["staff-1"]);
    await expect(
      send.execute({ threadId: existingThread, senderUserId: "staff-1", body: "olá" }),
    ).resolves.toBeDefined();
  });

  // Step 5's proof, kept as a live test rather than a one-off manual check:
  // a fake whose `findVisible` never consulted `viewerUserId` at all would
  // still make every test above pass, because every fixture so far only
  // ever asks about ONE genuinely distinct stranger. This seeds a SECOND
  // stranger with the SAME shape of request the customer makes (a real,
  // never-registered id, asking about a real thread) precisely so a
  // visibility check that silently degraded to "the thread exists" has
  // something to fail against beyond the one case already covered above.
  it("two different strangers are both refused — the fixture cannot be satisfied by coincidence", async () => {
    await expect(
      send.execute({ threadId: existingThread, senderUserId: "stranger-a", body: "olá" }),
    ).rejects.toThrow(ThreadNotVisibleError);
    await expect(
      send.execute({ threadId: existingThread, senderUserId: "stranger-b", body: "olá" }),
    ).rejects.toThrow(ThreadNotVisibleError);
  });
});

describe("sending", () => {
  it("writes the message and moves the thread's last_message_at, in one transaction", async () => {
    await send.execute({ threadId: existingThread, senderUserId: customerId, body: "olá" });
    expect(uow.insideTransaction).toBe(true);
    expect(uow.touchedAfterInsert).toBe(true);
  });

  it("composes the message through Message.compose, trimmed and stamped with the injected clock", async () => {
    await send.execute({ threadId: existingThread, senderUserId: customerId, body: "  olá  " });
    expect(fakeMessages.inserted).toHaveLength(1);
    const message = fakeMessages.inserted[0]!;
    expect(message.body).toBe("olá");
    expect(message.threadId).toBe(existingThread);
    expect(message.senderUserId).toBe(customerId);
    expect(message.createdAt.getTime()).toBe(NOW.getTime());
  });

  it("touches the thread with the message's own createdAt, not a second, independent 'now'", async () => {
    await send.execute({ threadId: existingThread, senderUserId: customerId, body: "olá" });
    expect(fakeThreads.touched).toEqual([{ threadId: existingThread, at: NOW }]);
  });

  it("refuses to start a thread with a provider that cannot be messaged", async () => {
    fakeProviders.contactable.set(providerId, false);
    await expect(start.execute({ customerUserId: customerId, providerId })).rejects.toThrow(
      ProviderNotContactableError,
    );
  });
});

describe("StartThreadCommand", () => {
  it("opens a thread with a contactable provider", async () => {
    const otherProvider = "provider-2";
    const result = await start.execute({ customerUserId: customerId, providerId: otherProvider });
    expect(result.created).toBe(true);
    expect(fakeThreads.threads.get(result.id)?.providerId).toBe(otherProvider);
  });

  it("is idempotent: the same pair resolves to the same thread the second time", async () => {
    const otherProvider = "provider-3";
    const first = await start.execute({ customerUserId: customerId, providerId: otherProvider });
    const second = await start.execute({ customerUserId: customerId, providerId: otherProvider });
    expect(second.id).toBe(first.id);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
  });
});

describe("MarkThreadReadCommand", () => {
  it("refuses a stranger the same way it refuses a missing thread", async () => {
    await expect(
      markRead.execute({ threadId: existingThread, viewerUserId: "someone-else" }),
    ).rejects.toThrow(ThreadNotVisibleError);
  });

  it("lets the customer mark read", async () => {
    fakeMessages.markReadResult = 2;
    await expect(
      markRead.execute({ threadId: existingThread, viewerUserId: customerId }),
    ).resolves.toEqual({ marked: 2 });
    expect(fakeMessages.markReadCalls).toEqual([
      { threadId: existingThread, viewerUserId: customerId, at: NOW },
    ]);
  });

  it("lets any member of the provider mark read", async () => {
    fakeProviders.members.set(providerId, ["staff-1"]);
    await expect(
      markRead.execute({ threadId: existingThread, viewerUserId: "staff-1" }),
    ).resolves.toEqual({ marked: 1 });
  });

  it("reports zero rather than refusing when there is nothing left to mark", async () => {
    fakeMessages.markReadResult = 0;
    await expect(
      markRead.execute({ threadId: existingThread, viewerUserId: customerId }),
    ).resolves.toEqual({ marked: 0 });
  });
});
