import { describe, expect, it } from "bun:test";
import { bootstrapQuote } from "../bootstrap";
import { FakeBookingOpener, FakeRaiser, FakeStartThread, FakeStorage } from "./support/fakes";

describe("bootstrapQuote", () => {
  it("constructs every use case the API and the cron reach", () => {
    const boot = bootstrapQuote({
      raiseNotification: new FakeRaiser(),
      openBooking: new FakeBookingOpener(),
      startThread: new FakeStartThread(),
      attachmentStorage: new FakeStorage(),
    });
    expect(Object.keys(boot.useCases).sort()).toEqual([
      "acceptQuote",
      "declineQuote",
      "internal",
      "proposeQuote",
      "rejectQuote",
      "requestQuote",
      "withdrawQuote",
    ]);
    expect(Object.keys(boot.useCases.internal).sort()).toEqual(["markProposalStale", "sweepDue"]);
  });
});
