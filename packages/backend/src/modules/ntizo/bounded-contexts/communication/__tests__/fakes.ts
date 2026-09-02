/**
 * Fakes shared by `commands.test.ts` and `support-commands.test.ts` — moved
 * here rather than duplicated in both, since both files exercise the same
 * ports (`ThreadRepositoryPort`, `MessageRepositoryPort`,
 * `AttachmentRepositoryPort`, `SupportRequestRepositoryPort`,
 * `AttachmentStoragePort`, `RaiseNotificationInternalPort`) and a
 * `UnitOfWorkPort` that actually tracks what ran inside which transaction.
 *
 * Fakes exercised by only ONE of the two files —
 * `commands.test.ts`'s `FakeProviderReader` (shares its `members` map with
 * `FakeThreadRepository`'s visibility logic) and `support-commands.test.ts`'s
 * `FakeBookingReader` / `FakeAdminUserReader` / `FakeProviderReader` (a
 * differently-shaped provider reader that has nothing to do with thread
 * visibility) — stay local to the file that needs them.
 */
import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { Message } from "../domain/aggregates/message.aggregate";
import { SupportRequest } from "../domain/aggregates/support-request.aggregate";
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
import type {
  AttachmentStoragePort,
  StoredAttachmentMetadata,
} from "../app/ports/outbound/attachment-storage.port";
import type {
  SupportRequestFilter,
  SupportRequestListItem,
  SupportRequestPage,
  SupportRequestRepositoryPort,
} from "../app/ports/outbound/support-request.repository.port";
import type {
  RaiseNotificationInput,
  RaiseNotificationInternalPort,
} from "../app/ports/outbound/raise-notification.port";
import type { AttachmentRow, ThreadRow } from "../../../shared/infrastructure/database/communication/schemas";

export type TrackedOp = "insert" | "touch" | "attachment" | "request" | "thread";

/**
 * A record of one write a fake repository made, tagged with whichever
 * `atomicExecute` invocation was open at the moment it happened — `null`
 * when none was.
 *
 * The tag is what `TrackingUnitOfWork.bothWritesInSameTransaction` needs
 * and a plain ordered log cannot give it: an ordered log can prove "touch
 * happened after insert" without ever proving the two happened inside the
 * SAME transaction, or inside any transaction at all — see that getter's
 * own doc comment for the mutation this closes. `"attachment"`, `"request"`
 * and `"thread"` joined `"insert"` and `"touch"` here for the same reason:
 * a fake that recorded one of those on some untagged, parallel list would
 * let a write land outside every `atomicExecute` invocation with nothing
 * here able to see it.
 */
export interface TrackedWrite {
  op: TrackedOp;
  transactionId: string | null;
}

/**
 * Reports whether `atomicExecute` ran the callback at all — deliberately
 * does not reset to `false` once the callback returns, unlike a "currently
 * inside a transaction" flag would: an assertion made AFTER `execute()` has
 * already resolved needs this, and a flag that reset itself in a `finally`
 * block could never observe anything but `false` there.
 *
 * `record(op)` is called by the fake repositories below, never by
 * production code — it stamps each write with whichever transaction id is
 * currently open (or `null`, outside every `atomicExecute`), so
 * `bothWritesInSameTransaction` can tell "both writes happened while the
 * same call to `atomicExecute` was open" apart from "happened in the right
 * order, but at least one of them outside a transaction, or inside two
 * different ones".
 */
export class TrackingUnitOfWork implements UnitOfWorkPort {
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
   * Not merely that `touch` happened after `insert` in program order (a
   * `touch` call sitting entirely outside `atomicExecute`, positioned after
   * it, would also satisfy that), but that every write the command made was
   * logged while ONE SAME `atomicExecute` invocation was the
   * currently-open one.
   *
   * The attachment write is checked the same way, but only when the test
   * actually produced one — an attachment-less send never calls
   * `insertMany`, and treating an absent write as a failure would make
   * every one of those tests red for a call that was never supposed to
   * happen.
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
 * asks, UNLESS `visibleRow` was given: a support-thread test never seeds a
 * matching `(customer, provider)` fixture, it just wants `findVisible` and
 * `findSupportThread` to answer with a fixed row it controls the `type` and
 * `providerId` of. The two modes are mutually exclusive per instance, not
 * merged — a test that needs both real membership *and* a fixed row is not
 * one of these fixtures' jobs.
 *
 * `members` is shared with a caller's own `FakeProviderReader` (the same
 * `Map` instance) in the ordinary (non-`visibleRow`) mode, exactly as
 * `provider_member` is the one fact both `DrizzleThreadRepository.findVisible`
 * and `DrizzleProviderReader.isMember` read in production.
 */
export class FakeThreadRepository implements ThreadRepositoryPort {
  threads = new Map<string, ThreadRow>();
  touched: { threadId: string; at: Date }[] = [];
  /** What `openSupport` was called with, in call order. */
  openedSupport: { customerUserId: string; providerId: string | null }[] = [];

  private readonly members: Map<string, string[]>;
  private readonly tracker?: TrackingUnitOfWork;
  private readonly visibleRow?: Partial<ThreadRow>;

  constructor(
    options: {
      members?: Map<string, string[]>;
      uow?: TrackingUnitOfWork;
      visibleRow?: Partial<ThreadRow>;
    } = {},
  ) {
    this.members = options.members ?? new Map();
    this.tracker = options.uow;
    this.visibleRow = options.visibleRow;
  }

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

  async openSupport(customerUserId: string, providerId: string | null, _now: Date): Promise<string> {
    this.tracker?.record("thread");
    this.openedSupport.push({ customerUserId, providerId });
    return "support-thread-1";
  }

  /** Returns `visibleRow` (the merged fixture) when its `type` is `"support"`, else null — same rule the real adapter applies, without a viewer check: the admin commands' handler has already proven the role. */
  async findSupportThread(threadId: string): Promise<ThreadRow | null> {
    const row = this.resolveRow(threadId);
    return row && row.type === "support" ? row : null;
  }

  async touch(threadId: string, at: Date): Promise<void> {
    this.tracker?.record("touch");
    this.touched.push({ threadId, at });
    const row = this.threads.get(threadId);
    if (row) this.threads.set(threadId, { ...row, lastMessageAt: at });
  }

  async findVisible(threadId: string, viewerUserId: string): Promise<ThreadRow | null> {
    if (this.visibleRow) return this.resolveRow(threadId);
    const row = this.threads.get(threadId);
    if (!row) return null;
    if (row.customerUserId === viewerUserId) return row;
    if (row.providerId !== null && (this.members.get(row.providerId) ?? []).includes(viewerUserId)) return row;
    return null;
  }

  async listForCustomer(): Promise<ThreadPage> {
    return { items: [], nextCursor: null };
  }

  async listForProvider(): Promise<ThreadPage> {
    return { items: [], nextCursor: null };
  }

  /**
   * Builds the fixed row `visibleRow` mode answers with. The three
   * defaults below are placeholders, not fixture identities this class
   * knows about — every test that sets `visibleRow` fully specifies
   * `type`, `customerUserId` and `providerId` itself, since this class is
   * shared by two test files with two different sets of id constants and
   * cannot privilege either one's.
   */
  private resolveRow(threadId: string): ThreadRow | null {
    if (!this.visibleRow) return this.threads.get(threadId) ?? null;
    return {
      id: threadId,
      type: "inquiry",
      customerUserId: "unspecified-customer",
      providerId: null,
      lastMessageAt: new Date(0),
      createdAt: new Date(0),
      ...this.visibleRow,
    };
  }
}

export class FakeMessageRepository implements MessageRepositoryPort {
  inserted: Message[] = [];
  markReadCalls: { threadId: string; viewerUserId: string; at: Date }[] = [];
  markReadResult = 1;
  /** Thread ids `markReadForPlatform` was called with, in call order. */
  platformReads: string[] = [];

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

  /** The platform side reading a support request — records the thread id and answers with `markReadResult`, the same fixture the participant read uses. */
  async markReadForPlatform(threadId: string, _at: Date): Promise<number> {
    this.platformReads.push(threadId);
    return this.markReadResult;
  }

  async claimDueForNotice(): Promise<DueMessage[]> {
    return [];
  }

  async markNotified(): Promise<void> {}

  async countUnreadForViewer(): Promise<Map<string, number>> {
    return new Map();
  }

  async countUnreadForPlatform(): Promise<never> {
    throw new Error("not used by this test");
  }
}

/**
 * `insertMany` is the only method `SendMessageCommand`, `OpenSupportRequestCommand`
 * and `ReplyToSupportRequestCommand` call; `findVisible` and `listForMessages`
 * are implemented anyway so this class satisfies `AttachmentRepositoryPort`
 * in full — `DrizzleAttachmentRepository`'s versions of those two are
 * exercised against the real database in `repositories.test.ts`, not here.
 * `findOnSupportThread` is not exercised by any command this task adds — it
 * is the download route's, a later task's concern — so it stays a stub.
 */
export class FakeAttachmentRepository implements AttachmentRepositoryPort {
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

  async findOnSupportThread(): Promise<never> {
    throw new Error("not used by this test");
  }
}

/**
 * Answers `head` purely from a map the test seeds directly — no bucket, no
 * I/O. Every key it is asked about is recorded too, so a test can prove a
 * no-I/O prefix check refused a descriptor BEFORE this port was ever
 * consulted, rather than merely refusing it somehow.
 */
export class FakeAttachmentStoragePort implements AttachmentStoragePort {
  objects = new Map<string, StoredAttachmentMetadata>();
  headCalls: string[] = [];

  async head(storageKey: string): Promise<StoredAttachmentMetadata | null> {
    this.headCalls.push(storageKey);
    return this.objects.get(storageKey) ?? null;
  }
}

export class FakeSupportRequestRepository implements SupportRequestRepositoryPort {
  readonly saved: SupportRequest[] = [];
  readonly inserted: SupportRequest[] = [];
  constructor(
    private readonly byThread: Map<string, SupportRequest> = new Map(),
    public openCount = 0,
    private readonly uow?: TrackingUnitOfWork,
  ) {}
  async insert(request: SupportRequest): Promise<void> {
    this.uow?.record("request");
    this.inserted.push(request);
    this.byThread.set(request.threadId, request);
  }
  async findByThreadId(threadId: string): Promise<SupportRequest | null> {
    return this.byThread.get(threadId) ?? null;
  }
  async findByThreadIds(ids: string[]): Promise<Map<string, SupportRequest>> {
    return new Map(ids.flatMap((id) => (this.byThread.has(id) ? [[id, this.byThread.get(id)!] as const] : [])));
  }
  async save(request: SupportRequest): Promise<void> {
    this.uow?.record("request");
    this.saved.push(request);
    this.byThread.set(request.threadId, request);
  }
  async countOpenForRequester(): Promise<number> {
    return this.openCount;
  }
  async listForAdmin(_f: SupportRequestFilter, _l: number, _c: string | null): Promise<SupportRequestPage> {
    return { items: [], nextCursor: null };
  }
  async findListItem(): Promise<SupportRequestListItem | null> {
    return null;
  }
  async countOpen(): Promise<number> {
    return this.openCount;
  }
}

/** Copied from `notify-unread.test.ts` — see that file for the reasoning behind `failOn`. */
export class FakeRaiseNotification implements RaiseNotificationInternalPort {
  readonly calls: RaiseNotificationInput[] = [];
  private shouldFail: ((input: RaiseNotificationInput) => boolean) | null = null;

  /** The next `execute` whose payload matches `predicate` throws instead of succeeding. */
  failOn(predicate: (input: RaiseNotificationInput) => boolean): void {
    this.shouldFail = predicate;
  }

  async execute(input: RaiseNotificationInput): Promise<{ notificationId: string }> {
    this.calls.push(input);
    if (this.shouldFail?.(input)) throw new Error("delivery exploded");
    return { notificationId: crypto.randomUUID() };
  }
}
