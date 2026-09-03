import { describe, expect, it } from "bun:test";
import { ContactRequest } from "../domain/aggregates/contact-request.aggregate";
import { ContactRateLimitedError, ContactRequestNotFoundError } from "../domain/exceptions";
import {
  RATE_LIMIT_MAX,
  SubmitContactRequestCommand,
} from "../app/use-cases/submit-contact-request.command";
import { ListContactRequestsForAdminQuery } from "../app/use-cases/list-contact-requests-for-admin.query";
import { SetContactRequestStatusCommand } from "../app/use-cases/set-contact-request-status.command";
import type {
  ContactRequestAdminPage,
  ContactRequestListInput,
  ContactRequestRepositoryPort,
} from "../app/ports/outbound/contact-request.repository.port";
import type { ContactInboxPort } from "../app/ports/outbound/contact-inbox.port";

class FakeRepo implements ContactRequestRepositoryPort {
  inserted: ContactRequest[] = [];
  statusSaved: ContactRequest[] = [];
  listCalls: ContactRequestListInput[] = [];
  constructor(
    private readonly opts: { countFromIp?: number; existing?: ContactRequest | null; saveStatusExists?: boolean } = {},
  ) {}
  async insert(request: ContactRequest): Promise<ContactRequest> {
    const stored = request.withId("7f3a2c9e-1b2d-4e5f-8a9b-0c1d2e3f4a5b", new Date("2026-09-02T10:00:00.000Z"));
    this.inserted.push(stored);
    return stored;
  }
  async findById(): Promise<ContactRequest | null> {
    return this.opts.existing ?? null;
  }
  async saveStatus(request: ContactRequest): Promise<boolean> {
    this.statusSaved.push(request);
    return this.opts.saveStatusExists ?? true;
  }
  async countFromIpSince(): Promise<number> {
    return this.opts.countFromIp ?? 0;
  }
  async listForAdmin(input: ContactRequestListInput): Promise<ContactRequestAdminPage> {
    this.listCalls.push(input);
    return { items: [], total: 0, openCount: 3 };
  }
}

class CapturingInbox implements ContactInboxPort {
  notified: ContactRequest[] = [];
  constructor(private readonly fails = false) {}
  async notify(request: ContactRequest): Promise<void> {
    if (this.fails) throw new Error("Resend is down");
    this.notified.push(request);
  }
}

function input(over: Partial<Parameters<SubmitContactRequestCommand["execute"]>[0]> = {}) {
  return {
    kind: "contact" as const,
    topic: "general",
    name: "Joana Matola",
    email: "joana@exemplo.com",
    message: "Gostava de propor uma parceria com a minha escola.",
    locale: "pt-MZ",
    originPath: null,
    requesterUserId: "u-1",
    ipAddress: "197.218.0.1",
    userAgent: "Mozilla/5.0",
    ...over,
  };
}

describe("SubmitContactRequestCommand", () => {
  it("stores the request, then tells the inbox, and answers with the id and the reference", async () => {
    const repo = new FakeRepo();
    const inbox = new CapturingInbox();
    const out = await new SubmitContactRequestCommand(repo, inbox).execute(input());

    expect(out).toEqual({ requestId: "7f3a2c9e-1b2d-4e5f-8a9b-0c1d2e3f4a5b", reference: "7F3A2C" });
    expect(repo.inserted).toHaveLength(1);
    expect(repo.inserted[0]!.name).toBe("Joana Matola");
    expect(inbox.notified).toHaveLength(1);
    // The inbox gets the STORED request — the one with an id and therefore a reference.
    expect(inbox.notified[0]!.id).toBe("7f3a2c9e-1b2d-4e5f-8a9b-0c1d2e3f4a5b");
  });

  it("a failing inbox does not fail the submission — the row is the source of truth", async () => {
    const repo = new FakeRepo();
    const out = await new SubmitContactRequestCommand(repo, new CapturingInbox(true)).execute(input());
    expect(out.reference).toBe("7F3A2C");
    expect(repo.inserted).toHaveLength(1);
  });

  it("refuses the sixth message from one address inside the window, and stores nothing", async () => {
    const repo = new FakeRepo({ countFromIp: RATE_LIMIT_MAX });
    const inbox = new CapturingInbox();
    await expect(new SubmitContactRequestCommand(repo, inbox).execute(input())).rejects.toThrow(ContactRateLimitedError);
    expect(repo.inserted).toEqual([]);
    expect(inbox.notified).toEqual([]);
  });

  it("allows the fifth", async () => {
    const repo = new FakeRepo({ countFromIp: RATE_LIMIT_MAX - 1 });
    await new SubmitContactRequestCommand(repo, new CapturingInbox()).execute(input());
    expect(repo.inserted).toHaveLength(1);
  });

  it("skips the count when the request carries no address rather than refusing everyone behind a missing header", async () => {
    const repo = new FakeRepo({ countFromIp: 99 });
    await new SubmitContactRequestCommand(repo, new CapturingInbox()).execute(input({ ipAddress: null }));
    expect(repo.inserted).toHaveLength(1);
  });
});

describe("ListContactRequestsForAdminQuery", () => {
  it("bounds the page, drops an empty search, and passes the filters through", async () => {
    const repo = new FakeRepo();
    const q = new ListContactRequestsForAdminQuery(repo);
    await q.execute({ limit: 500, offset: -3, search: "   ", kind: "feedback", status: "open" });
    expect(repo.listCalls[0]).toEqual({ limit: 100, offset: 0, kind: "feedback", status: "open" });
    await q.execute({});
    expect(repo.listCalls[1]).toEqual({ limit: 25, offset: 0 });
  });
});

describe("SetContactRequestStatusCommand", () => {
  const stored = ContactRequest.create(input()).withId("7f3a2c9e-1b2d-4e5f-8a9b-0c1d2e3f4a5b");

  it("resolves an open request, recording who did it", async () => {
    const repo = new FakeRepo({ existing: stored });
    const out = await new SetContactRequestStatusCommand(repo).execute({
      requestId: stored.id!,
      status: "resolved",
      actorUserId: "admin-1",
    });
    expect(out).toEqual({ status: "resolved" });
    expect(repo.statusSaved[0]!.status).toBe("resolved");
    expect(repo.statusSaved[0]!.resolvedByUserId).toBe("admin-1");
  });

  it("reopens a resolved one", async () => {
    const repo = new FakeRepo({ existing: stored.resolve(new Date(), "admin-1") });
    await new SetContactRequestStatusCommand(repo).execute({ requestId: stored.id!, status: "open", actorUserId: "admin-2" });
    expect(repo.statusSaved[0]!.status).toBe("open");
    expect(repo.statusSaved[0]!.resolvedByUserId).toBeNull();
  });

  it("refuses an id nobody has", async () => {
    const repo = new FakeRepo({ existing: null });
    await expect(
      new SetContactRequestStatusCommand(repo).execute({ requestId: "nope", status: "resolved", actorUserId: "admin-1" }),
    ).rejects.toThrow(ContactRequestNotFoundError);
  });
});
