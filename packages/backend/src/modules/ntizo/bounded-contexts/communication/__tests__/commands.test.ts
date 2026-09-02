import { beforeEach, describe, expect, it } from "bun:test";
import {
  AttachmentNotAvailableError,
  MessageContainsContactError,
  ProviderNotContactableError,
  ThreadNotVisibleError,
  TooManyAttachmentsError,
} from "../domain/exceptions";
import { SupportRequest } from "../domain/aggregates/support-request.aggregate";
import { StartThreadCommand } from "../app/use-cases/start-thread.command";
import {
  SendMessageCommand,
  type AttachmentDescriptor,
} from "../app/use-cases/send-message.command";
import { MarkThreadReadCommand } from "../app/use-cases/mark-thread-read.command";
import type { NewAttachment } from "../app/ports/outbound/attachment.repository.port";
import type { ProviderReaderPort } from "../app/ports/outbound/provider-reader.port";
import {
  FakeAttachmentRepository,
  FakeAttachmentStoragePort,
  FakeMessageRepository,
  FakeSupportRequestRepository,
  FakeThreadRepository,
  TrackingUnitOfWork,
} from "./fakes";

const NOW = new Date("2026-08-27T10:00:00.000Z");

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
const staffId = "staff-1";

let members: Map<string, string[]>;
let fakeThreads: FakeThreadRepository;
let fakeMessages: FakeMessageRepository;
let fakeAttachments: FakeAttachmentRepository;
let fakeAttachmentStorage: FakeAttachmentStoragePort;
let fakeSupportRequests: FakeSupportRequestRepository;
let fakeProviders: FakeProviderReader;
let uow: TrackingUnitOfWork;
let existingThread: string;

let start: StartThreadCommand;
let send: SendMessageCommand;
let markRead: MarkThreadReadCommand;

beforeEach(() => {
  members = new Map();
  uow = new TrackingUnitOfWork();
  fakeThreads = new FakeThreadRepository({ members, uow });
  fakeMessages = new FakeMessageRepository(uow);
  fakeAttachments = new FakeAttachmentRepository(uow);
  fakeAttachmentStorage = new FakeAttachmentStoragePort();
  fakeSupportRequests = new FakeSupportRequestRepository();
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
  send = new SendMessageCommand(
    fakeThreads,
    fakeMessages,
    fakeAttachments,
    fakeSupportRequests,
    fakeAttachmentStorage,
    uow,
    () => NOW,
  );
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
    const descriptor: AttachmentDescriptor = {
      storageKey: `attachment/${customerId}/one.png`,
    };
    fakeAttachmentStorage.objects.set(descriptor.storageKey, {
      contentType: "image/png",
      sizeBytes: 1024,
      uploadedByUserId: customerId,
      originalName: "one.png",
    });
    const resolved: NewAttachment = {
      storageKey: descriptor.storageKey,
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
      attachments: [descriptor],
    });

    expect(fakeAttachments.inserted).toEqual([{ messageId: result.id, attachments: [resolved] }]);
    // The assertion that actually proves "one transaction" for all three
    // writes — see `bothWritesInSameTransaction`'s own doc comment for why
    // this, and not `insideTransaction`/`touchedAfterInsert` alone, is what
    // catches the attachment insert moving outside `atomicExecute`.
    expect(uow.bothWritesInSameTransaction).toBe(true);
  });

  it("resolves fileName, contentType and sizeBytes from storage, ignoring anything the caller's descriptor claims about them", async () => {
    // The forged-type case Task 6b closes: a caller uploaded a real PNG
    // (`fakeAttachmentStorage` holds what storage actually recorded) and
    // then sends a descriptor smuggling forged `fileName`, `contentType`
    // and `sizeBytes` — the exact shape a client could build if it ever
    // stopped going through `AttachmentDescriptor`'s real, narrower type.
    // `as unknown as AttachmentDescriptor` is deliberate here: the type
    // system already refuses these fields; this proves the RUNTIME
    // behaviour refuses them too, in case that type ever widens. This is
    // also Critical 2's own proof: the whole-branch review's finding was
    // that a client sending back a *different* `fileName` from the one it
    // uploaded under was undetected — this seeds storage with the TRUE name
    // ("photo.png") and asserts the forged one ("evil.jpg") never reaches
    // what gets inserted.
    const storageKey = `attachment/${customerId}/photo.png`;
    fakeAttachmentStorage.objects.set(storageKey, {
      contentType: "image/png",
      sizeBytes: 55,
      uploadedByUserId: customerId,
      originalName: "photo.png",
    });
    const hostileDescriptor = {
      storageKey,
      fileName: "evil.jpg",
      contentType: "text/html",
      sizeBytes: 999_999,
    } as unknown as AttachmentDescriptor;

    const result = await send.execute({
      threadId: existingThread,
      senderUserId: customerId,
      body: "",
      attachments: [hostileDescriptor],
    });

    expect(fakeAttachments.inserted).toEqual([
      {
        messageId: result.id,
        attachments: [{ storageKey, fileName: "photo.png", contentType: "image/png", sizeBytes: 55 }],
      },
    ]);
  });

  it("refuses an attachment whose stored object carries no recorded name", async () => {
    // Critical 2's own ruling: an object that exists, and was uploaded by
    // this sender, but was never stamped with `customMetadata.originalName`
    // did not come through the real upload route — refused the same way a
    // missing object is, rather than guessed at with a placeholder name.
    const storageKey = `attachment/${customerId}/nameless.png`;
    fakeAttachmentStorage.objects.set(storageKey, {
      contentType: "image/png",
      sizeBytes: 10,
      uploadedByUserId: customerId,
      originalName: null,
    });

    await expect(
      send.execute({
        threadId: existingThread,
        senderUserId: customerId,
        body: "",
        attachments: [{ storageKey }],
      }),
    ).rejects.toThrow(AttachmentNotAvailableError);
    expect(fakeAttachments.inserted).toEqual([]);
  });

  it("refuses an attachment whose stored contentType is not one ACCEPTED_ATTACHMENT_TYPES lists", async () => {
    // Unreachable through the real upload route (`sniffContentType` never
    // stamps anything else) — this is Minor 1's boundary check, proving the
    // exported list actually constrains rather than merely documents.
    const storageKey = `attachment/${customerId}/script.svg`;
    fakeAttachmentStorage.objects.set(storageKey, {
      contentType: "image/svg+xml",
      sizeBytes: 10,
      uploadedByUserId: customerId,
      originalName: "script.svg",
    });

    await expect(
      send.execute({
        threadId: existingThread,
        senderUserId: customerId,
        body: "",
        attachments: [{ storageKey }],
      }),
    ).rejects.toThrow(AttachmentNotAvailableError);
    expect(fakeAttachments.inserted).toEqual([]);
  });

  it("refuses a storage key that is not this sender's own, without ever consulting storage", async () => {
    // No object seeded for this key at all — if the prefix check were
    // skipped, the missing-object check below would still refuse this, but
    // `headCalls` staying empty is what proves THIS check — the free,
    // no-I/O one — is the one that actually fired.
    const foreignKey = "attachment/someone-else/one.png";

    await expect(
      send.execute({
        threadId: existingThread,
        senderUserId: customerId,
        body: "",
        attachments: [{ storageKey: foreignKey }],
      }),
    ).rejects.toThrow(AttachmentNotAvailableError);
    expect(fakeAttachmentStorage.headCalls).toEqual([]);
    expect(fakeAttachments.inserted).toEqual([]);
  });

  it("refuses when the object's own uploader disagrees with the storage key's prefix", async () => {
    // The key's prefix names `customerId` — passing the free check above —
    // but the object's OWN metadata, an independent record of the same
    // fact, names somebody else. Only reachable by seeding the fake this
    // way; the real upload route always writes both together (see
    // `apps/backend/api/src/attachments.ts`). This proves the second check
    // is enforced on its own, not merely implied by the first.
    const key = `attachment/${customerId}/spoofed.png`;
    fakeAttachmentStorage.objects.set(key, {
      contentType: "image/png",
      sizeBytes: 10,
      uploadedByUserId: "someone-else",
      originalName: "spoofed.png",
    });

    await expect(
      send.execute({
        threadId: existingThread,
        senderUserId: customerId,
        body: "",
        attachments: [{ storageKey: key }],
      }),
    ).rejects.toThrow(AttachmentNotAvailableError);
    expect(fakeAttachments.inserted).toEqual([]);
  });

  it("refuses a descriptor pointing at a key nothing was ever uploaded to", async () => {
    await expect(
      send.execute({
        threadId: existingThread,
        senderUserId: customerId,
        body: "",
        attachments: [{ storageKey: `attachment/${customerId}/missing.png` }],
      }),
    ).rejects.toThrow(AttachmentNotAvailableError);
    expect(fakeAttachments.inserted).toEqual([]);
  });

  it("refuses more than five attachment descriptors before consulting storage at all", async () => {
    const tooMany: AttachmentDescriptor[] = Array.from({ length: 6 }, (_, i) => ({
      storageKey: `attachment/${customerId}/${i}.png`,
    }));

    await expect(
      send.execute({
        threadId: existingThread,
        senderUserId: customerId,
        body: "olá",
        attachments: tooMany,
      }),
    ).rejects.toThrow(TooManyAttachmentsError);
    expect(fakeAttachmentStorage.headCalls).toEqual([]);
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

/**
 * Critical 1's own proof. Whole-branch review found `hasContact` had
 * exactly three call sites — two in the browser (`MessageComposer`,
 * `useAttachments`'s file-name check) and one on the file NAME at upload
 * (`apps/backend/api/src/attachments.ts`) — and nothing on the send path
 * ever ran it over the message body. A `curl` posting a body straight past
 * both browser checks was written verbatim. These tests exercise the
 * COMMAND directly, not the composer — proving the gate is real regardless
 * of what client is talking to it.
 */
describe("contact detection", () => {
  it("refuses a body carrying a phone number before anything is written", async () => {
    await expect(
      send.execute({
        threadId: existingThread,
        senderUserId: customerId,
        body: "liga-me 84 123 4567",
      }),
    ).rejects.toThrow(MessageContainsContactError);
    expect(fakeMessages.inserted).toEqual([]);
    expect(fakeThreads.touched).toEqual([]);
  });

  it("checks the TRIMMED body — surrounding whitespace does not hide a contact", async () => {
    await expect(
      send.execute({
        threadId: existingThread,
        senderUserId: customerId,
        body: "   liga-me 84 123 4567   ",
      }),
    ).rejects.toThrow(MessageContainsContactError);
  });

  it("refuses on the contact check before ever consulting attachment storage", async () => {
    // Cheap-check-first ordering, the same reasoning `resolveAttachments`
    // itself already applies to `MAX_ATTACHMENTS`: a body carrying a contact
    // is refused without the command ever resolving a descriptor against
    // storage, even when one rode along.
    await expect(
      send.execute({
        threadId: existingThread,
        senderUserId: customerId,
        body: "liga-me 84 123 4567",
        attachments: [{ storageKey: `attachment/${customerId}/one.png` }],
      }),
    ).rejects.toThrow(MessageContainsContactError);
    expect(fakeAttachmentStorage.headCalls).toEqual([]);
  });

  it("does not refuse an ordinary body carrying no contact information", async () => {
    await expect(
      send.execute({ threadId: existingThread, senderUserId: customerId, body: "Confirmado para sexta." }),
    ).resolves.toBeDefined();
  });
});

describe("sending into a support request", () => {
  const supportRow = { type: "support", customerUserId: customerId, providerId: null } as const;

  it("does not run the contact check on a support thread, and writes the requester's side", async () => {
    const threads = new FakeThreadRepository({ visibleRow: supportRow });
    const messages = new FakeMessageRepository(uow);
    const requests = new FakeSupportRequestRepository();
    const send = new SendMessageCommand(threads, messages, fakeAttachments, requests, fakeAttachmentStorage, uow, () => NOW);

    await send.execute({ threadId: "t1", senderUserId: customerId, body: "liga-me para o 84 123 4567" });

    expect(messages.inserted[0]?.senderSide).toBe("customer");
  });

  it("still refuses contact details on an inquiry", async () => {
    const threads = new FakeThreadRepository({ visibleRow: { type: "inquiry", customerUserId: customerId, providerId } });
    const send = new SendMessageCommand(
      threads,
      new FakeMessageRepository(uow),
      fakeAttachments,
      new FakeSupportRequestRepository(),
      fakeAttachmentStorage,
      uow,
      () => NOW,
    );
    await expect(send.execute({ threadId: "t1", senderUserId: customerId, body: "84 123 4567" })).rejects.toBeInstanceOf(
      MessageContainsContactError,
    );
  });

  it("a member replying on a provider request writes the provider side", async () => {
    const threads = new FakeThreadRepository({ visibleRow: { type: "support", customerUserId: "opener", providerId } });
    const messages = new FakeMessageRepository(uow);
    const send = new SendMessageCommand(
      threads,
      messages,
      fakeAttachments,
      new FakeSupportRequestRepository(),
      fakeAttachmentStorage,
      uow,
      () => NOW,
    );
    await send.execute({ threadId: "t1", senderUserId: staffId, body: "ok" });
    expect(messages.inserted[0]?.senderSide).toBe("provider");
  });

  it("reopens a resolved request in the same transaction as the message", async () => {
    const resolved = SupportRequest.open({ threadId: "t1", audience: "customer", subject: "x", bookingId: null, now: NOW }).resolve(
      "admin",
      NOW,
    );
    const requests = new FakeSupportRequestRepository(new Map([["t1", resolved]]), 0, uow);
    const threads = new FakeThreadRepository({ visibleRow: supportRow });
    const send = new SendMessageCommand(
      threads,
      new FakeMessageRepository(uow),
      fakeAttachments,
      requests,
      fakeAttachmentStorage,
      uow,
      () => NOW,
    );

    await send.execute({ threadId: "t1", senderUserId: customerId, body: "ainda não" });

    expect(requests.saved[0]?.status).toBe("open");
    const insertTx = uow.writes.find((w) => w.op === "insert")?.transactionId;
    const requestTx = uow.writes.find((w) => w.op === "request")?.transactionId;
    expect(insertTx).not.toBeNull();
    expect(requestTx).toBe(insertTx);
  });

  it("leaves an open request alone", async () => {
    const open = SupportRequest.open({ threadId: "t1", audience: "customer", subject: "x", bookingId: null, now: NOW });
    const requests = new FakeSupportRequestRepository(new Map([["t1", open]]));
    const threads = new FakeThreadRepository({ visibleRow: supportRow });
    const send = new SendMessageCommand(
      threads,
      new FakeMessageRepository(uow),
      fakeAttachments,
      requests,
      fakeAttachmentStorage,
      uow,
      () => NOW,
    );
    await send.execute({ threadId: "t1", senderUserId: customerId, body: "mais uma" });
    expect(requests.saved).toHaveLength(0);
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
