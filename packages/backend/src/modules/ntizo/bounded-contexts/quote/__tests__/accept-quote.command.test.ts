import { describe, expect, it } from "bun:test";
import { NotificationType } from "@ntizo/shared";
import { AcceptQuoteCommand, type AcceptQuoteInput } from "../app/use-cases/accept-quote.command";
import { MarkProposalStaleInternalCommand } from "../app/use-cases/mark-proposal-stale.internal.command";
import {
  QuoteAddressRequiredError, QuoteMemberCannotPerformError, QuoteNoCustomerPhoneError,
  QuoteNotYoursError, QuoteProposalLapsedError, QuoteServiceNotQuotableError, QuoteSlotTakenError, QuoteTransitionError,
} from "../domain/exceptions";
import {
  ADDRESS, CapturingOutbox, FakeBookingOpener, FakePhoneReader, FakeQuoteRepo, FakeRaiser,
  FakeServiceReader, FakeSettings, TrackingUnitOfWork, lapsedProposedQuote, proposedQuote,
  requestedQuote, serviceSnapshot, withId,
} from "./support/fakes";

function setup(initial = withId(proposedQuote(), "q-1"), opts: { opener?: FakeBookingOpener; phones?: FakePhoneReader; snapshot?: ReturnType<typeof serviceSnapshot> } = {}) {
  const unitOfWork = new TrackingUnitOfWork();
  const outbox = new CapturingOutbox(unitOfWork);
  const repo = new FakeQuoteRepo(initial, unitOfWork);
  const services = new FakeServiceReader(opts.snapshot ?? serviceSnapshot());
  const phones = opts.phones ?? new FakePhoneReader();
  const opener = opts.opener ?? new FakeBookingOpener(null, unitOfWork);
  const settings = new FakeSettings();
  const raiser = new FakeRaiser(null, unitOfWork);
  const stale = new MarkProposalStaleInternalCommand(repo, services, settings, unitOfWork, outbox, raiser);
  const command = new AcceptQuoteCommand(repo, services, phones, opener, unitOfWork, outbox, raiser, stale);
  return { command, repo, opener, services, raiser, outbox, unitOfWork, stale };
}

const INPUT: AcceptQuoteInput = { quoteId: "q-1", requesterUserId: "cust-1" };

describe("AcceptQuoteCommand", () => {
  it("opens the booking inside the transaction and closes the quote onto it", async () => {
    const { command, repo, opener, services, raiser, outbox, unitOfWork } = setup();

    const result = await command.execute(INPUT);

    expect(result.bookingId).toBe("bk-1");
    expect(repo.state?.status).toBe("ACCEPTED");
    expect(repo.state?.bookingId).toBe("bk-1");
    expect(repo.state?.expiresAt).toBeNull();
    expect(opener.calls[0]).toMatchObject({
      quoteId: "q-1", customerId: "cust-1", providerMemberId: "mem-1", priceMinor: 9_800,
      durationMinutes: 240, serviceName: "Instalação de ar condicionado", acceptedByUserId: "cust-1",
    });
    expect(opener.calls[0]?.address).toMatchObject({ label: "Casa", city: "Maputo" });
    // The quote's own locale, not a default: it is what the booking's
    // snapshotted service name comes back written in.
    expect(services.calls).toEqual([{ serviceId: "svc-1", locale: "pt-MZ" }]);
    expect(unitOfWork.order).toEqual(["openBooking", "save"]);
    expect(outbox.published[0]?.events[0]?.eventName).toBe("quote.accepted");
    expect(outbox.published[0]?.insideTransaction).toBe(true);
    expect(raiser.raised.map((r) => r.type)).toEqual([NotificationType.QuoteAccepted, NotificationType.ProviderQuoteAccepted]);
    expect(raiser.insideTransactionAtCall).toEqual([false, false]);
  });

  it("takes the address at acceptance when the request carried none", async () => {
    const noAddress = withId(proposedQuote({ address: null }), "q-1");
    const { command, opener } = setup(noAddress);
    await command.execute({ ...INPUT, address: ADDRESS });
    expect(opener.calls[0]?.address).toMatchObject({ line: "Av. Julius Nyerere 1234" });

    const still = setup(withId(proposedQuote({ address: null }), "q-1"));
    await expect(still.command.execute(INPUT)).rejects.toThrow(QuoteAddressRequiredError);
    expect(still.opener.calls).toHaveLength(0);
    expect(still.repo.saveCalls).toBe(0);
  });

  it("refuses another customer, a quote with no proposal, a lapsed proposal, and a customer with no phone", async () => {
    const notYours = setup();
    await expect(notYours.command.execute({ ...INPUT, requesterUserId: "cust-2" })).rejects.toThrow(QuoteNotYoursError);
    expect(notYours.opener.calls).toHaveLength(0);
    expect(notYours.repo.saveCalls).toBe(0);

    const noProposal = setup(withId(requestedQuote(), "q-1"));
    await expect(noProposal.command.execute(INPUT)).rejects.toThrow(QuoteTransitionError);
    expect(noProposal.opener.calls).toHaveLength(0);
    expect(noProposal.repo.saveCalls).toBe(0);

    const lapsedSetup = setup(withId(lapsedProposedQuote(), "q-1"));
    await expect(lapsedSetup.command.execute(INPUT)).rejects.toThrow(QuoteProposalLapsedError);
    expect(lapsedSetup.opener.calls).toHaveLength(0);
    expect(lapsedSetup.repo.saveCalls).toBe(0);

    const noPhone = setup(withId(proposedQuote(), "q-1"), { phones: new FakePhoneReader({ "cust-1": null }) });
    await expect(noPhone.command.execute(INPUT)).rejects.toThrow(QuoteNoCustomerPhoneError);
    expect(noPhone.opener.calls).toHaveLength(0);
    expect(noPhone.repo.saveCalls).toBe(0);
  });

  it("re-checks that the service and the member are still good", async () => {
    const gone = setup(withId(proposedQuote(), "q-1"), { snapshot: serviceSnapshot({ providerStatus: "suspended" }) });
    await expect(gone.command.execute(INPUT)).rejects.toThrow(QuoteServiceNotQuotableError);
    expect(gone.opener.calls).toHaveLength(0);
    expect(gone.repo.saveCalls).toBe(0);

    const dropped = setup(withId(proposedQuote(), "q-1"), { snapshot: serviceSnapshot({ memberIds: ["mem-2"] }) });
    await expect(dropped.command.execute(INPUT)).rejects.toThrow(QuoteMemberCannotPerformError);
    expect(dropped.opener.calls).toHaveLength(0);
    expect(dropped.repo.saveCalls).toBe(0);
  });

  it("when the calendar refuses, nothing is accepted and the quote goes back to the provider", async () => {
    const busy = setup(withId(proposedQuote(), "q-1"), { opener: new FakeBookingOpener(new QuoteSlotTakenError()) });

    await expect(busy.command.execute(INPUT)).rejects.toThrow(QuoteSlotTakenError);

    expect(busy.repo.state?.status).toBe("REQUESTED");
    expect(busy.repo.state?.liveProposal).toBeNull();
    expect(busy.repo.state?.proposals[0]?.supersededCause).toBe("slot_taken");
    expect(busy.repo.state?.expiresAt).not.toBeNull();
    expect(busy.raiser.raised[0]).toMatchObject({ type: NotificationType.ProviderQuoteSlotTaken, audience: "provider" });
  });
});
