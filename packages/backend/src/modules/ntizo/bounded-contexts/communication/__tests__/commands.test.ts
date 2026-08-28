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
import type { AttachmentRepositoryPort, NewAttachment } from "../app/ports/outbound/attachment.repository.port";
import type { ProviderReaderPort } from "../app/ports/outbound/provider-reader.port";
import type {
  AttachmentRow,
  ThreadRow,
} from "../../../shared/infrastructure/database/communication/schemas";

const NOW = new Date("2026-08-27T10:00:00.000Z");

type TrackedOp = "insert" | "touch" | "attachment";

/**
 * A record of one write a fake repository made, tagged with whichever
 * `atomicExecute` invocation was open at the moment it happened — `null`
 * when none was.
 *
 * The tag is what `TrackingUnitOfWork.bothWritesInSameTransaction` needs
 * and a plain ordered log cannot give it: an ordered log can prove "touch
 * happened after insert" without ever proving the two happened inside the
 * SAME transaction, or inside any transaction at all — see that getter's
 * own doc comment for the mutation this closes. `"attachment"` joined
 * `"insert"` and `"touch"` here for the same reason: a fake that recorded
 * it on some untagged, parallel list would let an attachment write land
 * outside every `atomicExecute` invocation with nothing here able to see it
 * — see `bothWritesInSameTransaction`'s doc comment.
 */
interface TrackedWrite {
  op: TrackedOp;
  transactionId: string | null;
}

/**
 * Reports whether `atomicExecute` ran the callback at all — deliberately
 * does not reset to `false` once the callback returns, unlike a "currently
 * inside a transaction" flag would: the assertion this exists for
 * (`sending`'s "in one transaction" test) checks it AFTER `execute()` has
 * already resolved, so a flag that reset itself in a `finally` block could
 * never observe anything but `false` there.
 *
 * `record(op)` is called by the fake repositories below, never by
 * production code — it stamps each write with whichever transaction id is
 * currently open (or `null`, outside every `atomicExecute`), so
 * `bothWritesInSameTransaction` can tell "both writes happened while the
 * same call to `atomicExecute` was open" apart from "happened in the right
 * order, but at least one of them outside a transaction, or inside two
 * different ones".
 */
class TrackingUnitOfWork implements UnitOfWorkPort {
  insideTransaction = false;
  readonly writes: TrackedWrite[] = [];
  private openTransactionId: string | null = null;
  private nextId = 1;

  async atomicExecute<T>(work: () => Promise<T>): Promise<T> {
    this.insideTransaction = true;
    const id = `tx-${this.nextId++}`;
    const outer = this.openTransactionId;
    this.openTransactionId = id;
    try {
      return await work();
    } finally {
      // Restored, not cleared to `null` unconditionally — a nested
      // `atomicExecute` (none of this task's commands call one, but
      // `DrizzleUnitOfWork.atomicExecute` joins an already-open transaction
      // rather than opening a second one, so a future command that does
      // nest must see the OUTER transaction still open on the way back out,
      // not "no transaction").
      this.openTransactionId = outer;
    }
  }

  record(op: TrackedOp): void {
    this.writes.push({ op, transactionId: this.openTransactionId });
  }

  get touchedAfterInsert(): boolean {
    const insertAt = this.writes.findIndex((w) => w.op === "insert");
    const touchAt = this.writes.findIndex((w) => w.op === "touch");
    return insertAt !== -1 && touchAt !== -1 && insertAt < touchAt;
  }

  /**
   * The claim `SendMessageCommand`'s own doc comment makes: not merely that
   * touch happened after insert in program order (a `touch` call sitting
   * entirely outside `atomicExecute`, positioned after it, would also
   * satisfy that), but that every write the command made was logged while
   * ONE SAME `atomicExecute` invocation was the currently-open one.
   *
   * A production change that narrows the transaction to cover only the
   * insert — `await this.unitOfWork.atomicExecute(() => this.messages.insert(message));
   * await this.threads.touch(...)` outside it — keeps the writes in the
   * right order and still calls `atomicExecute` once, so `insideTransaction`
   * and `touchedAfterInsert` both stay green under it. This getter is what
   * actually catches that: `touch`'s `transactionId` is `null` (recorded
   * outside every open transaction), so it can never equal `insert`'s.
   *
   * The attachment write is checked the same way, but only when the test
   * actually produced one — an attachment-less send (most of this file's
   * tests) never calls `insertMany`, and treating an absent write as a
   * failure would make every one of those tests red for a call that was
   * never supposed to happen. When an attachment write IS present, it must
   * share `insert`'s transaction id too — this is what catches the exact
   * mutation the brief calls out: the attachment insert moving outside
   * `atomicExecute` entirely, which `TrackedOp` widened to `"attachment"` to
   * make visible in the first place (see `TrackedWrite`'s doc comment) —
   * before that widening, a third op invisible to this getter could sit
   * anywhere and this assertion would stay green regardless.
   */
  get bothWritesInSameTransaction(): boolean {
    const insert = this.writes.find((w) => w.op === "insert");
    const touch = this.writes.find((w) => w.op === "touch");
    if (insert === undefined || touch === undefined) return false;
    if (insert.transactionId === null || insert.transactionId !== touch.transactionId) return false;

    const attachment = this.writes.find((w) => w.op === "attachment");
    if (attachment !== undefined && attachment.transactionId !== insert.transactionId) return false;

    return true;
  }
}

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
    private readonly tracker?: TrackingUnitOfWork,
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
    this.tracker?.record("touch");
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

  constructor(private readonly tracker?: TrackingUnitOfWork) {}

  async insert(message: Message): Promise<string> {
    this.tracker?.record("insert");
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

/**
 * `insertMany` is the only method `SendMessageCommand` calls; `findVisible`
 * and `listForMessages` are implemented anyway so this class satisfies
 * `AttachmentRepositoryPort` in full — `DrizzleAttachmentRepository`'s
 * versions of those two are exercised against the real database in
 * `repositories.test.ts`, not here.
 */
class FakeAttachmentRepository implements AttachmentRepositoryPort {
  inserted: { messageId: string; attachments: NewAttachment[] }[] = [];

  constructor(private readonly tracker?: TrackingUnitOfWork) {}

  async insertMany(messageId: string, attachments: NewAttachment[]): Promise<void> {
    this.tracker?.record("attachment");
    this.inserted.push({ messageId, attachments });
  }

  async listForMessages(): Promise<Map<string, AttachmentRow[]>> {
    return new Map();
  }

  async findVisible(): Promise<AttachmentRow | null> {
    return null;
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

const customerId = "customer-1";
const providerId = "provider-1";

let members: Map<string, string[]>;
let fakeThreads: FakeThreadRepository;
let fakeMessages: FakeMessageRepository;
let fakeAttachments: FakeAttachmentRepository;
let fakeProviders: FakeProviderReader;
let uow: TrackingUnitOfWork;
let existingThread: string;

let start: StartThreadCommand;
let send: SendMessageCommand;
let markRead: MarkThreadReadCommand;

beforeEach(() => {
  members = new Map();
  uow = new TrackingUnitOfWork();
  fakeThreads = new FakeThreadRepository(members, uow);
  fakeMessages = new FakeMessageRepository(uow);
  fakeAttachments = new FakeAttachmentRepository(uow);
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
  send = new SendMessageCommand(fakeThreads, fakeMessages, fakeAttachments, uow, () => NOW);
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
  it("writes the message and moves the thread's last_message_at, inside the same transaction", async () => {
    await send.execute({ threadId: existingThread, senderUserId: customerId, body: "olá" });
    expect(uow.insideTransaction).toBe(true);
    expect(uow.touchedAfterInsert).toBe(true);
    // The assertion that actually proves "one transaction", not merely
    // "a transaction was opened, and touch happened after insert" — see
    // `bothWritesInSameTransaction`'s own doc comment for the mutation this
    // alone catches: narrowing `atomicExecute` to wrap only the insert,
    // order otherwise preserved, leaves both assertions above green.
    expect(uow.bothWritesInSameTransaction).toBe(true);
  });

  it("writes the message and its attachments in one transaction", async () => {
    const one: NewAttachment = {
      storageKey: "communication/one.png",
      fileName: "one.png",
      contentType: "image/png",
      sizeBytes: 1024,
    };
    // Empty body, one attachment: legal per `Message.compose` since Task 2 —
    // a photograph with no caption is a message.
    const result = await send.execute({
      threadId: existingThread,
      senderUserId: customerId,
      body: "",
      attachments: [one],
    });

    expect(fakeAttachments.inserted).toEqual([{ messageId: result.id, attachments: [one] }]);
    // The assertion that actually proves "one transaction" for all three
    // writes — see `bothWritesInSameTransaction`'s own doc comment for why
    // this, and not `insideTransaction`/`touchedAfterInsert` alone, is what
    // catches the attachment insert moving outside `atomicExecute`.
    expect(uow.bothWritesInSameTransaction).toBe(true);
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
