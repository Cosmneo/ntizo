import { describe, expect, it } from "bun:test";
import { NotificationType } from "@ntizo/shared";
import { RequestQuoteCommand, type RequestQuoteInput } from "../app/use-cases/request-quote.command";
import {
  QuoteAddressRequiredError,
  QuoteAttachmentNotAvailableError,
  QuoteContainsContactError,
  QuoteServiceNotQuotableError,
} from "../domain/exceptions";
import {
  ADDRESS,
  CapturingOutbox,
  FakeAttachmentRepo,
  FakeMemberReader,
  FakeQuoteRepo,
  FakeRaiser,
  FakeServiceReader,
  FakeStartThread,
  FakeStorage,
  TrackingUnitOfWork,
  serviceSnapshot,
  storedPhoto,
} from "./support/fakes";

function setup(opts: { snapshot?: ReturnType<typeof serviceSnapshot> | null; storage?: FakeStorage; raiser?: FakeRaiser } = {}) {
  const unitOfWork = new TrackingUnitOfWork();
  const outbox = new CapturingOutbox(unitOfWork);
  const repo = new FakeQuoteRepo(null, unitOfWork);
  const attachments = new FakeAttachmentRepo(unitOfWork);
  const services = new FakeServiceReader(opts.snapshot === undefined ? serviceSnapshot() : opts.snapshot);
  const storage = opts.storage ?? new FakeStorage({ "attachment/cust-1/1-a.jpg": storedPhoto("cust-1") });
  const startThread = new FakeStartThread();
  const raiser = opts.raiser ?? new FakeRaiser(null, unitOfWork);
  const command = new RequestQuoteCommand(repo, attachments, services, startThread, storage, unitOfWork, outbox, raiser);
  return { command, repo, attachments, services, storage, startThread, raiser, outbox, unitOfWork };
}

const INPUT: RequestQuoteInput = {
  customerId: "cust-1",
  serviceId: "svc-1",
  description: "Dois aparelhos split de 12 000 BTU no 3.º andar",
  neededBy: "2026-09-27",
  address: ADDRESS,
  attachments: [{ storageKey: "attachment/cust-1/1-a.jpg" }],
  locale: "pt-MZ",
};

describe("RequestQuoteCommand", () => {
  it("opens the thread, writes the quote and its files in one transaction, and tells the provider afterwards", async () => {
    const { command, repo, attachments, startThread, raiser, outbox, unitOfWork } = setup();

    const result = await command.execute(INPUT);

    expect(result.quoteId).toBe("q-1");
    expect(startThread.calls).toEqual([{ customerUserId: "cust-1", providerId: "prov-1" }]);
    expect(repo.inserted).toHaveLength(1);
    expect(repo.inserted[0]?.status).toBe("REQUESTED");
    expect(repo.inserted[0]?.threadId).toBe("thr-1");
    expect(attachments.rows).toEqual([
      { quoteId: "q-1", proposalId: null, step: "request", storageKey: "attachment/cust-1/1-a.jpg", fileName: "parede.jpg", contentType: "image/jpeg", sizeBytes: 120_000 },
    ]);
    expect(unitOfWork.order).toEqual(["insert", "attachments"]);
    expect(outbox.published[0]?.aggregateType).toBe("quote");
    expect(outbox.published[0]?.events[0]?.eventName).toBe("quote.requested");
    expect(raiser.raised[0]).toMatchObject({ type: NotificationType.ProviderQuoteRequested, audience: "provider", providerId: "prov-1" });
    expect(raiser.insideTransactionAtCall).toEqual([false]);
  });

  it("stamps the response window from the service's own promise", async () => {
    const { command, repo } = setup({ snapshot: serviceSnapshot({ quoteForm: { responseHours: 24, askDeadline: true, askPhotos: true, askLocation: true, intro: null } }) });
    await command.execute(INPUT);
    const expiresAt = repo.inserted[0]!.expiresAt!.getTime();
    expect(expiresAt - repo.inserted[0]!.requestedAt.getTime()).toBe(24 * 3_600_000);
  });

  it("refuses a service that is missing, unpublished, priced, or whose provider is inactive", async () => {
    await expect(setup({ snapshot: null }).command.execute(INPUT)).rejects.toThrow(QuoteServiceNotQuotableError);
    await expect(setup({ snapshot: serviceSnapshot({ serviceStatus: "draft" }) }).command.execute(INPUT)).rejects.toThrow(QuoteServiceNotQuotableError);
    await expect(setup({ snapshot: serviceSnapshot({ bookingMode: "priced" }) }).command.execute(INPUT)).rejects.toThrow(QuoteServiceNotQuotableError);
    await expect(setup({ snapshot: serviceSnapshot({ providerStatus: "suspended" }) }).command.execute(INPUT)).rejects.toThrow(QuoteServiceNotQuotableError);
  });

  it("requires an address when the form asks for one or the work happens at the customer's", async () => {
    const atCustomer = setup({ snapshot: serviceSnapshot({ locationType: "at_customer", quoteForm: { responseHours: 48, askDeadline: true, askPhotos: true, askLocation: false, intro: null } }) });
    await expect(atCustomer.command.execute({ ...INPUT, address: null })).rejects.toThrow(QuoteAddressRequiredError);

    const remote = setup({ snapshot: serviceSnapshot({ locationType: "remote", quoteForm: { responseHours: 48, askDeadline: true, askPhotos: true, askLocation: false, intro: null } }) });
    const result = await remote.command.execute({ ...INPUT, address: null });
    expect(result.quoteId).toBe("q-1");
    expect(remote.repo.inserted[0]?.hasCompleteAddress()).toBe(false);
  });

  it("refuses a description carrying a phone number, and a file the caller did not upload", async () => {
    await expect(setup().command.execute({ ...INPUT, description: "Liga-me para o 84 123 4567" })).rejects.toThrow(QuoteContainsContactError);
    const foreign = setup({ storage: new FakeStorage({ "attachment/other-user/1-a.jpg": storedPhoto("other-user") }) });
    await expect(foreign.command.execute({ ...INPUT, attachments: [{ storageKey: "attachment/other-user/1-a.jpg" }] })).rejects.toThrow(QuoteAttachmentNotAvailableError);
  });

  it("a failing notification leaves the quote written", async () => {
    const { command, repo } = setup({ raiser: new FakeRaiser(new Error("resend down")) });
    await command.execute(INPUT);
    expect(repo.inserted).toHaveLength(1);
  });
});
