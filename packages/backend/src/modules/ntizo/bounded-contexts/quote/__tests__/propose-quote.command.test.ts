import { describe, expect, it } from "bun:test";
import { NotificationType } from "@ntizo/shared";
import { ProposeQuoteCommand, type ProposeQuoteInput } from "../app/use-cases/propose-quote.command";
import {
  NotProviderMemberError,
  QuoteContainsContactError,
  QuoteMemberCannotPerformError,
  QuotePriceBelowMinimumError,
  QuoteSlotOverlapError,
} from "../domain/exceptions";
import {
  CapturingOutbox,
  FakeAttachmentRepo,
  FakeMemberReader,
  FakeOverlap,
  FakeQuoteRepo,
  FakeRaiser,
  FakeServiceReader,
  FakeSettings,
  FakeStorage,
  NEXT_WEEK,
  TrackingUnitOfWork,
  proposedQuote,
  requestedQuote,
  serviceSnapshot,
  withId,
} from "./support/fakes";

function setup(initial = withId(requestedQuote(), "q-1"), opts: { overlap?: FakeOverlap; settings?: FakeSettings; snapshot?: ReturnType<typeof serviceSnapshot> } = {}) {
  const unitOfWork = new TrackingUnitOfWork();
  const outbox = new CapturingOutbox(unitOfWork);
  const repo = new FakeQuoteRepo(initial, unitOfWork);
  const attachments = new FakeAttachmentRepo(unitOfWork);
  const members = new FakeMemberReader();
  const services = new FakeServiceReader(opts.snapshot ?? serviceSnapshot());
  const overlap = opts.overlap ?? new FakeOverlap(false);
  const settings = opts.settings ?? new FakeSettings();
  const storage = new FakeStorage({ "attachment/user-right-1/1-o.pdf": { contentType: "application/pdf", sizeBytes: 84_000, uploadedByUserId: "user-right-1", originalName: "orcamento.pdf" } });
  const raiser = new FakeRaiser(null, unitOfWork);
  const command = new ProposeQuoteCommand(repo, attachments, members, services, overlap, settings, storage, unitOfWork, outbox, raiser);
  return { command, repo, attachments, members, overlap, raiser, outbox, unitOfWork };
}

const INPUT: ProposeQuoteInput = {
  quoteId: "q-1",
  requesterUserId: "user-right-1",
  priceMinor: 9_800,
  startsAt: NEXT_WEEK,
  durationMinutes: 240,
  providerMemberId: "mem-1",
  note: "Inclui tubagem até 3 m por aparelho",
  attachments: [{ storageKey: "attachment/user-right-1/1-o.pdf" }],
};

describe("ProposeQuoteCommand", () => {
  it("moves the quote to PROPOSED, writes the proposal's files, and tells the customer", async () => {
    const { command, repo, attachments, raiser, outbox, unitOfWork } = setup();

    const result = await command.execute(INPUT);

    expect(result?.quoteId).toBe("q-1");
    expect(repo.state?.status).toBe("PROPOSED");
    expect(repo.state?.liveProposal).toMatchObject({ priceMinor: 9_800, providerMemberId: "mem-1", durationMinutes: 240 });
    expect(attachments.rows[0]).toMatchObject({ quoteId: "q-1", step: "proposal", proposalId: "prop-1", fileName: "orcamento.pdf" });
    expect(unitOfWork.order).toEqual(["save", "attachments"]);
    expect(outbox.published[0]?.events[0]?.eventName).toBe("quote.proposed");
    expect(outbox.published[0]?.insideTransaction).toBe(true);
    expect((outbox.published[0]?.events[0]?.payload as { revision: boolean }).revision).toBe(false);
    expect(raiser.raised[0]).toMatchObject({ type: NotificationType.QuoteReceived, audience: "user", userId: "cust-1" });
  });

  it("a revision supersedes the previous proposal and says so in the event", async () => {
    const { command, repo, outbox } = setup(withId(proposedQuote(), "q-1"));
    await command.execute({ ...INPUT, priceMinor: 8_900 });
    expect(repo.state?.proposals).toHaveLength(2);
    expect(repo.state?.proposals[0]?.supersededCause).toBe("revised");
    expect((outbox.published[0]?.events[0]?.payload as { revision: boolean }).revision).toBe(true);
  });

  it("stamps the validity from the platform setting, capped at the proposed start", async () => {
    const { command, repo } = setup(withId(requestedQuote(), "q-1"), { settings: new FakeSettings(72) });
    await command.execute(INPUT);
    const validUntil = repo.state!.liveProposal!.validUntil.getTime();
    expect(validUntil).toBeLessThanOrEqual(NEXT_WEEK.getTime());
    expect(validUntil - Date.now()).toBeLessThanOrEqual(72 * 3_600_000 + 5_000);

    const soon = new Date(Date.now() + 3_600_000);
    const capped = setup(withId(requestedQuote(), "q-1"), { settings: new FakeSettings(72) });
    await capped.command.execute({ ...INPUT, startsAt: soon, durationMinutes: 30 });
    expect(capped.repo.state!.liveProposal!.validUntil).toEqual(soon);
  });

  it("refuses a caller from another workspace, and never writes for one", async () => {
    const { command, repo } = setup();
    await expect(command.execute({ ...INPUT, requesterUserId: "user-wrong" })).rejects.toThrow(NotProviderMemberError);
    expect(repo.saveCalls).toBe(0);
  });

  it("refuses a member who does not perform the service, a price under the floor, a note with contact details, and a time already sold", async () => {
    await expect(setup().command.execute({ ...INPUT, providerMemberId: "mem-9" })).rejects.toThrow(QuoteMemberCannotPerformError);
    await expect(setup().command.execute({ ...INPUT, priceMinor: 4_999 })).rejects.toThrow(QuotePriceBelowMinimumError);
    await expect(setup().command.execute({ ...INPUT, note: "Whatsapp 84 123 4567" })).rejects.toThrow(QuoteContainsContactError);
    const busy = setup(withId(requestedQuote(), "q-1"), { overlap: new FakeOverlap(true) });
    await expect(busy.command.execute(INPUT)).rejects.toThrow(QuoteSlotOverlapError);
    expect(busy.overlap.calls[0]).toMatchObject({ providerMemberId: "mem-1", startsAt: NEXT_WEEK });
  });

  it("returns null and announces nothing when the row moved on under it", async () => {
    const { command, repo, raiser } = setup();
    repo.currentStatusOverride = "DECLINED";
    expect(await command.execute(INPUT)).toBeNull();
    expect(raiser.raised).toHaveLength(0);
  });
});
