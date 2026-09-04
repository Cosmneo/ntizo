import { beforeEach, describe, expect, it } from "bun:test";
import { NotificationType } from "@ntizo/shared";
import { OpenSupportRequestCommand } from "../app/use-cases/open-support-request.command";
import { ReplyToSupportRequestCommand } from "../app/use-cases/reply-to-support-request.command";
import { ResolveSupportRequestCommand } from "../app/use-cases/resolve-support-request.command";
import { MarkSupportRequestReadCommand } from "../app/use-cases/mark-support-request-read.command";
import {
  MessageEmptyError,
  SupportAlreadyResolvedError,
  SupportBookingNotYoursError,
  SupportNotAMemberError,
  SupportRequestNotFoundError,
  SupportSubjectInvalidError,
  SupportTooManyOpenError,
} from "../domain/exceptions";
import { SupportRequest } from "../domain/aggregates/support-request.aggregate";
import type { BookingReaderPort } from "../app/ports/outbound/booking-reader.port";
import type { AdminUserReaderPort } from "../app/ports/outbound/admin-user-reader.port";
import type { ProviderReaderPort } from "../app/ports/outbound/provider-reader.port";
import {
  FakeAttachmentRepository,
  FakeAttachmentStoragePort,
  FakeMessageRepository,
  FakeRaiseNotification,
  FakeSupportRequestRepository,
  FakeThreadRepository,
  TrackingUnitOfWork,
} from "./fakes";

const NOW = new Date("2026-08-27T10:00:00.000Z");
const customerId = "customer-1";
const providerId = "provider-1";
const staffId = "staff-1";

class FakeBookingReader implements BookingReaderPort {
  constructor(private readonly owned: Set<string>) {}
  async isOwnedBy(bookingId: string, requester: { userId: string; providerId: string | null }): Promise<boolean> {
    return this.owned.has(`${bookingId}:${requester.providerId ?? requester.userId}`);
  }
}
class FakeAdminUserReader implements AdminUserReaderPort {
  constructor(private readonly ids: string[]) {}
  async findAdminUserIds(): Promise<string[]> {
    return this.ids;
  }
}
class FakeProviderReader implements ProviderReaderPort {
  constructor(private readonly members: Set<string>) {}
  async isContactable(): Promise<boolean> {
    return true;
  }
  async isMember(providerId: string, userId: string): Promise<boolean> {
    return this.members.has(`${providerId}:${userId}`);
  }
}

let uow: TrackingUnitOfWork;
let attachments: FakeAttachmentRepository;
let storage: FakeAttachmentStoragePort;

beforeEach(() => {
  uow = new TrackingUnitOfWork();
  attachments = new FakeAttachmentRepository(uow);
  storage = new FakeAttachmentStoragePort();
});

function openCommand(
  overrides: Partial<{
    requests: FakeSupportRequestRepository;
    providers: FakeProviderReader;
    bookings: FakeBookingReader;
    admins: FakeAdminUserReader;
    raised: FakeRaiseNotification;
    threads: FakeThreadRepository;
    messages: FakeMessageRepository;
  }> = {},
) {
  const deps = {
    threads: overrides.threads ?? new FakeThreadRepository({ uow }),
    requests: overrides.requests ?? new FakeSupportRequestRepository(new Map(), 0, uow),
    messages: overrides.messages ?? new FakeMessageRepository(uow),
    providers: overrides.providers ?? new FakeProviderReader(new Set([`${providerId}:${staffId}`])),
    bookings: overrides.bookings ?? new FakeBookingReader(new Set([`b1:${customerId}`, `b2:${providerId}`])),
    admins: overrides.admins ?? new FakeAdminUserReader(["admin-1", "admin-2"]),
    raised: overrides.raised ?? new FakeRaiseNotification(),
  };
  const command = new OpenSupportRequestCommand(
    deps.threads,
    deps.requests,
    deps.messages,
    attachments,
    storage,
    deps.providers,
    deps.bookings,
    deps.admins,
    deps.raised,
    uow,
    () => NOW,
  );
  return { command, ...deps };
}

describe("opening a personal request", () => {
  it("writes thread, request and first message in one transaction, and tells every admin", async () => {
    const { command, requests, messages, raised } = openCommand();
    const result = await command.execute({
      requesterUserId: customerId,
      audience: "customer",
      subject: " Reembolso ",
      body: "Paguei duas vezes",
    });

    expect(result.threadId).toBe("support-thread-1");
    expect(requests.inserted[0]).toMatchObject({ subject: "Reembolso", audience: "customer", bookingId: null, status: "open" });
    expect(messages.inserted[0]).toMatchObject({ threadId: "support-thread-1", senderSide: "customer", body: "Paguei duas vezes" });

    const txs = new Set(uow.writes.filter((w) => ["thread", "request", "insert"].includes(w.op)).map((w) => w.transactionId));
    expect(txs.size).toBe(1);
    expect([...txs][0]).not.toBeNull();

    expect(raised.calls).toEqual([
      {
        type: NotificationType.SupportRequestOpened,
        audience: "user",
        userId: "admin-1",
        payload: { threadId: "support-thread-1", subject: "Reembolso", requestAudience: "customer" },
      },
      {
        type: NotificationType.SupportRequestOpened,
        audience: "user",
        userId: "admin-2",
        payload: { threadId: "support-thread-1", subject: "Reembolso", requestAudience: "customer" },
      },
    ]);
  });

  it("refuses a bad subject before writing anything", async () => {
    const { command, requests } = openCommand();
    await expect(
      command.execute({ requesterUserId: customerId, audience: "customer", subject: "  ", body: "x" }),
    ).rejects.toBeInstanceOf(SupportSubjectInvalidError);
    expect(requests.inserted).toHaveLength(0);
    expect(uow.writes).toHaveLength(0);
  });

  it("does not run the contact check", async () => {
    const { command, messages } = openCommand();
    await command.execute({ requesterUserId: customerId, audience: "customer", subject: "Contacto", body: "o meu número é 84 123 4567" });
    expect(messages.inserted).toHaveLength(1);
  });

  it("attaches a booking the requester owns and refuses one they do not", async () => {
    const { command, requests } = openCommand();
    await command.execute({ requesterUserId: customerId, audience: "customer", subject: "Reserva", body: "x", bookingId: "b1" });
    expect(requests.inserted[0]?.bookingId).toBe("b1");
    await expect(
      command.execute({ requesterUserId: customerId, audience: "customer", subject: "Reserva", body: "x", bookingId: "b2" }),
    ).rejects.toBeInstanceOf(SupportBookingNotYoursError);
  });

  // The column Task 2 added, and the whole reason it exists: resolving a
  // dispute moves the booking it is about, and resolving an ordinary support
  // request must not. Every caller that predates disputes keeps opening
  // `support`, and only the booking context's port asks for the other value.
  it("opens as support by default and as a dispute when asked", async () => {
    const { command, requests } = openCommand();

    await command.execute({ requesterUserId: customerId, audience: "customer", subject: "Reembolso", body: "x" });
    expect(requests.inserted[0]?.kind).toBe("support");

    await command.execute({
      requesterUserId: customerId,
      audience: "customer",
      subject: "Avaria eléctrica urgente",
      body: "não ficou bem",
      bookingId: "b1",
      kind: "dispute",
    });
    expect(requests.inserted[1]?.kind).toBe("dispute");
    // The booking travels with it — a dispute with no booking on it is a
    // complaint about nothing, and the admin queue joins on this column.
    expect(requests.inserted[1]?.bookingId).toBe("b1");
  });

  it("refuses the eleventh open request", async () => {
    const { command } = openCommand({ requests: new FakeSupportRequestRepository(new Map(), 10, uow) });
    await expect(
      command.execute({ requesterUserId: customerId, audience: "customer", subject: "x", body: "x" }),
    ).rejects.toBeInstanceOf(SupportTooManyOpenError);
  });

  it("refuses an empty body with no attachments before writing anything", async () => {
    const { command } = openCommand();
    await expect(
      command.execute({ requesterUserId: customerId, audience: "customer", subject: "x", body: "   " }),
    ).rejects.toBeInstanceOf(MessageEmptyError);
    expect(uow.writes).toHaveLength(0);
  });

  it("a failing admin notification does not undo the request", async () => {
    const raised = new FakeRaiseNotification();
    raised.failOn(() => true);
    const { command, requests } = openCommand({ raised });
    const result = await command.execute({ requesterUserId: customerId, audience: "customer", subject: "x", body: "x" });
    expect(result.threadId).toBe("support-thread-1");
    expect(requests.inserted).toHaveLength(1);
  });
});

describe("opening a provider request", () => {
  it("requires membership, records the provider, and writes the provider side", async () => {
    const { command, requests, messages, threads } = openCommand();
    await command.execute({ requesterUserId: staffId, audience: "provider", providerId, subject: "Comissão", body: "x" });
    expect(threads.openedSupport[0]).toEqual({ customerUserId: staffId, providerId });
    expect(requests.inserted[0]?.audience).toBe("provider");
    expect(messages.inserted[0]?.senderSide).toBe("provider");
  });

  it("refuses a non-member, and a provider audience with no provider", async () => {
    const { command } = openCommand();
    await expect(
      command.execute({ requesterUserId: customerId, audience: "provider", providerId, subject: "x", body: "x" }),
    ).rejects.toBeInstanceOf(SupportNotAMemberError);
    await expect(
      command.execute({ requesterUserId: staffId, audience: "provider", subject: "x", body: "x" }),
    ).rejects.toBeInstanceOf(SupportNotAMemberError);
  });

  it("checks a booking against the provider, not the member", async () => {
    const { command, requests } = openCommand();
    await command.execute({ requesterUserId: staffId, audience: "provider", providerId, subject: "x", body: "x", bookingId: "b2" });
    expect(requests.inserted[0]?.bookingId).toBe("b2");
  });
});

describe("the admin commands", () => {
  const supportRow = { id: "t1", type: "support", customerUserId: customerId, providerId: null } as const;

  it("reply writes a platform message on a support thread and touches it", async () => {
    const threads = new FakeThreadRepository({ visibleRow: supportRow, uow });
    const messages = new FakeMessageRepository(uow);
    const reply = new ReplyToSupportRequestCommand(threads, messages, attachments, storage, uow, () => NOW);
    await reply.execute({ threadId: "t1", adminUserId: "admin-1", body: "Já tratámos." });
    expect(messages.inserted[0]?.senderSide).toBe("platform");
    expect(uow.touchedAfterInsert).toBe(true);
  });

  it("reply refuses an inquiry id the same way as a missing one", async () => {
    const threads = new FakeThreadRepository({ visibleRow: { ...supportRow, type: "inquiry", providerId } });
    const reply = new ReplyToSupportRequestCommand(threads, new FakeMessageRepository(uow), attachments, storage, uow, () => NOW);
    await expect(reply.execute({ threadId: "t1", adminUserId: "admin-1", body: "x" })).rejects.toBeInstanceOf(
      SupportRequestNotFoundError,
    );
  });

  it("resolve saves the resolution and tells the requester side", async () => {
    const open = SupportRequest.open({ threadId: "t1", audience: "customer", subject: "Reembolso", bookingId: null, now: NOW });
    const requests = new FakeSupportRequestRepository(new Map([["t1", open]]));
    const threads = new FakeThreadRepository({ visibleRow: supportRow });
    const raised = new FakeRaiseNotification();
    const resolve = new ResolveSupportRequestCommand(threads, requests, raised, () => NOW);

    const out = await resolve.execute({ threadId: "t1", adminUserId: "admin-1" });

    expect(out).toEqual({ threadId: "t1", status: "resolved" });
    expect(requests.saved[0]).toMatchObject({ status: "resolved", resolvedByUserId: "admin-1" });
    expect(raised.calls).toEqual([
      {
        type: NotificationType.SupportRequestResolved,
        audience: "user",
        userId: customerId,
        payload: { threadId: "t1", subject: "Reembolso", requestAudience: "customer" },
      },
    ]);
  });

  it("resolve on a provider request tells the provider", async () => {
    const open = SupportRequest.open({ threadId: "t1", audience: "provider", subject: "Comissão", bookingId: null, now: NOW });
    const requests = new FakeSupportRequestRepository(new Map([["t1", open]]));
    const threads = new FakeThreadRepository({ visibleRow: { ...supportRow, customerUserId: staffId, providerId } });
    const raised = new FakeRaiseNotification();
    await new ResolveSupportRequestCommand(threads, requests, raised, () => NOW).execute({ threadId: "t1", adminUserId: "admin-1" });
    expect(raised.calls[0]).toMatchObject({ audience: "provider", providerId, payload: { requestAudience: "provider", providerId } });
  });

  it("a failing notification does not undo the resolution", async () => {
    const open = SupportRequest.open({ threadId: "t1", audience: "customer", subject: "Reembolso", bookingId: null, now: NOW });
    const requests = new FakeSupportRequestRepository(new Map([["t1", open]]));
    const threads = new FakeThreadRepository({ visibleRow: supportRow });
    const raised = new FakeRaiseNotification();
    raised.failOn(() => true);
    const resolve = new ResolveSupportRequestCommand(threads, requests, raised, () => NOW);

    // The `console.error` this logs on the way out is expected output for
    // this test, not a failure — the raise really did fail, on purpose.
    const out = await resolve.execute({ threadId: "t1", adminUserId: "admin-1" });

    expect(out).toEqual({ threadId: "t1", status: "resolved" });
    expect(requests.saved[0]?.status).toBe("resolved");
  });

  it("resolve twice is refused; resolve on a missing request is not found", async () => {
    const resolved = SupportRequest.open({ threadId: "t1", audience: "customer", subject: "x", bookingId: null, now: NOW }).resolve(
      "a",
      NOW,
    );
    const requests = new FakeSupportRequestRepository(new Map([["t1", resolved]]));
    const threads = new FakeThreadRepository({ visibleRow: supportRow });
    const resolve = new ResolveSupportRequestCommand(threads, requests, new FakeRaiseNotification(), () => NOW);
    await expect(resolve.execute({ threadId: "t1", adminUserId: "a" })).rejects.toBeInstanceOf(SupportAlreadyResolvedError);
    await expect(resolve.execute({ threadId: "nope", adminUserId: "a" })).rejects.toBeInstanceOf(SupportRequestNotFoundError);
  });

  it("markRead reads for the platform side only on a support thread", async () => {
    const messages = new FakeMessageRepository(uow);
    const threads = new FakeThreadRepository({ visibleRow: supportRow });
    const mark = new MarkSupportRequestReadCommand(threads, messages, () => NOW);
    await mark.execute({ threadId: "t1" });
    expect(messages.platformReads).toEqual(["t1"]);
    const inquiry = new FakeThreadRepository({ visibleRow: { ...supportRow, type: "inquiry", providerId } });
    await expect(new MarkSupportRequestReadCommand(inquiry, messages, () => NOW).execute({ threadId: "t1" })).rejects.toBeInstanceOf(
      SupportRequestNotFoundError,
    );
  });
});
