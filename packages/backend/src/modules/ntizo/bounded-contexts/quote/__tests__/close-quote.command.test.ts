import { describe, expect, it } from "bun:test";
import { NotificationType } from "@ntizo/shared";
import { DeclineQuoteCommand } from "../app/use-cases/decline-quote.command";
import { RejectQuoteCommand } from "../app/use-cases/reject-quote.command";
import { WithdrawQuoteCommand } from "../app/use-cases/withdraw-quote.command";
import { NotProviderMemberError, QuoteContainsContactError, QuoteNotYoursError, QuoteTransitionError } from "../domain/exceptions";
import {
  CapturingOutbox, FakeAttachmentRepo, FakeMemberReader, FakeQuoteRepo, FakeRaiser, FakeStorage,
  TrackingUnitOfWork, proposedQuote, requestedQuote, withId,
} from "./support/fakes";

function wiring(initial: Parameters<typeof withId>[0]) {
  const unitOfWork = new TrackingUnitOfWork();
  const outbox = new CapturingOutbox(unitOfWork);
  const repo = new FakeQuoteRepo(withId(initial, "q-1"), unitOfWork);
  const attachments = new FakeAttachmentRepo(unitOfWork);
  const members = new FakeMemberReader();
  const storage = new FakeStorage({ "attachment/user-right-1/1-x.pdf": { contentType: "application/pdf", sizeBytes: 1_000, uploadedByUserId: "user-right-1", originalName: "x.pdf" } });
  const raiser = new FakeRaiser(null, unitOfWork);
  return { unitOfWork, outbox, repo, attachments, members, storage, raiser };
}

describe("DeclineQuoteCommand", () => {
  it("closes a request with the reason, the note and its files, and tells the customer", async () => {
    const w = wiring(requestedQuote());
    const command = new DeclineQuoteCommand(w.repo, w.attachments, w.members, w.storage, w.unitOfWork, w.outbox, w.raiser);

    await command.execute({
      quoteId: "q-1", requesterUserId: "user-right-1", reason: "outside_area",
      note: "Só fazemos instalações em Maputo cidade", attachments: [{ storageKey: "attachment/user-right-1/1-x.pdf" }],
    });

    expect(w.repo.state?.status).toBe("DECLINED");
    expect(w.repo.state?.closedReason).toBe("outside_area");
    expect(w.repo.state?.closedNote).toBe("Só fazemos instalações em Maputo cidade");
    expect(w.repo.state?.closedByUserId).toBe("user-right-1");
    expect(w.repo.state?.expiresAt).toBeNull();
    expect(w.attachments.rows[0]).toMatchObject({ step: "closing", proposalId: null, fileName: "x.pdf" });
    expect(w.outbox.published[0]?.events[0]?.eventName).toBe("quote.declined");
    expect(w.outbox.published[0]?.insideTransaction).toBe(true);
    expect(w.raiser.raised[0]).toMatchObject({ type: NotificationType.QuoteDeclined, audience: "user", userId: "cust-1" });
  });

  it("works from PROPOSED too, and refuses a caller from another workspace", async () => {
    const proposed = wiring(proposedQuote());
    const ok = new DeclineQuoteCommand(proposed.repo, proposed.attachments, proposed.members, proposed.storage, proposed.unitOfWork, proposed.outbox, proposed.raiser);
    await ok.execute({ quoteId: "q-1", requesterUserId: "user-right-2", reason: "not_available" });
    expect(proposed.repo.state?.status).toBe("DECLINED");

    const w = wiring(requestedQuote());
    const command = new DeclineQuoteCommand(w.repo, w.attachments, w.members, w.storage, w.unitOfWork, w.outbox, w.raiser);
    await expect(command.execute({ quoteId: "q-1", requesterUserId: "user-wrong", reason: "other" })).rejects.toThrow(NotProviderMemberError);
    expect(w.repo.saveCalls).toBe(0);
    expect(w.outbox.published).toHaveLength(0);
    expect(w.attachments.rows).toHaveLength(0);
    expect(w.raiser.raised).toHaveLength(0);
  });

  it("refuses a note carrying contact details", async () => {
    const w = wiring(requestedQuote());
    const command = new DeclineQuoteCommand(w.repo, w.attachments, w.members, w.storage, w.unitOfWork, w.outbox, w.raiser);
    await expect(command.execute({ quoteId: "q-1", requesterUserId: "user-right-1", reason: "other", note: "liga 841234567" })).rejects.toThrow(QuoteContainsContactError);
  });
});

describe("RejectQuoteCommand", () => {
  it("lets the quote's own customer refuse a proposal and tells the provider", async () => {
    const w = wiring(proposedQuote());
    const command = new RejectQuoteCommand(w.repo, w.attachments, w.storage, w.unitOfWork, w.outbox, w.raiser);
    await command.execute({ quoteId: "q-1", requesterUserId: "cust-1", reason: "too_expensive" });
    expect(w.repo.state?.status).toBe("REJECTED");
    expect(w.outbox.published[0]?.insideTransaction).toBe(true);
    expect(w.raiser.raised[0]).toMatchObject({ type: NotificationType.ProviderQuoteDeclined, audience: "provider", providerId: "prov-1" });
  });

  it("refuses another customer, and refuses a quote with no proposal yet", async () => {
    const w = wiring(proposedQuote());
    const command = new RejectQuoteCommand(w.repo, w.attachments, w.storage, w.unitOfWork, w.outbox, w.raiser);
    await expect(command.execute({ quoteId: "q-1", requesterUserId: "cust-2", reason: "other" })).rejects.toThrow(QuoteNotYoursError);
    expect(w.repo.saveCalls).toBe(0);
    expect(w.outbox.published).toHaveLength(0);
    expect(w.attachments.rows).toHaveLength(0);
    expect(w.raiser.raised).toHaveLength(0);

    const early = wiring(requestedQuote());
    const c2 = new RejectQuoteCommand(early.repo, early.attachments, early.storage, early.unitOfWork, early.outbox, early.raiser);
    await expect(c2.execute({ quoteId: "q-1", requesterUserId: "cust-1", reason: "other" })).rejects.toThrow(QuoteTransitionError);
  });
});

describe("WithdrawQuoteCommand", () => {
  it("takes back a request that has no proposal, with the token reason", async () => {
    const w = wiring(requestedQuote());
    const command = new WithdrawQuoteCommand(w.repo, w.attachments, w.storage, w.unitOfWork, w.outbox, w.raiser);
    await command.execute({ quoteId: "q-1", requesterUserId: "cust-1" });
    expect(w.repo.state?.status).toBe("WITHDRAWN");
    expect(w.repo.state?.closedReason).toBe("withdrawn");
    expect(w.outbox.published[0]?.insideTransaction).toBe(true);
    expect(w.raiser.raised[0]).toMatchObject({ type: NotificationType.ProviderQuoteWithdrawn, audience: "provider" });
  });

  it("refuses once a proposal exists — the customer rejects instead", async () => {
    const w = wiring(proposedQuote());
    const command = new WithdrawQuoteCommand(w.repo, w.attachments, w.storage, w.unitOfWork, w.outbox, w.raiser);
    await expect(command.execute({ quoteId: "q-1", requesterUserId: "cust-1" })).rejects.toThrow(QuoteTransitionError);
  });
});
