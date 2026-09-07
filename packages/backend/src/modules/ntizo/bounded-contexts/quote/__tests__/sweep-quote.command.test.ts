import { describe, expect, it } from "bun:test";
import { NotificationType } from "@ntizo/shared";
import { SweepQuoteCommand } from "../app/use-cases/sweep-quote.command";
import { SweepDueQuotesInternalCommand } from "../app/use-cases/sweep-due-quotes.internal.command";
import {
  CapturingOutbox, FakeQuoteRepo, FakeRaiser, FakeServiceReader, TrackingUnitOfWork,
  proposedQuote, requestedQuote, withId,
} from "./support/fakes";

function setup(initial: Parameters<typeof withId>[0]) {
  const unitOfWork = new TrackingUnitOfWork();
  const outbox = new CapturingOutbox(unitOfWork);
  const repo = new FakeQuoteRepo(withId(initial, "q-1"), unitOfWork);
  const services = new FakeServiceReader();
  const raiser = new FakeRaiser(null, unitOfWork);
  const command = new SweepQuoteCommand(repo, services, unitOfWork, outbox, raiser);
  return { command, repo, raiser, outbox };
}

describe("SweepQuoteCommand", () => {
  it("expires an unanswered request and tells the customer why", async () => {
    const { command, repo, raiser, outbox } = setup(requestedQuote());
    expect(await command.execute({ quoteId: "q-1" })).toBe("expired");
    expect(repo.state?.status).toBe("EXPIRED");
    expect(repo.state?.expiredCause).toBe("provider_did_not_respond");
    expect(outbox.published[0]?.events[0]?.eventName).toBe("quote.expired");
    expect(outbox.published[0]?.insideTransaction).toBe(true);
    expect(raiser.raised[0]).toMatchObject({ type: NotificationType.QuoteExpired, audience: "user", userId: "cust-1" });
    expect(raiser.insideTransactionAtCall).toEqual([false]);
  });

  it("expires a proposal nobody decided and tells the provider", async () => {
    const { command, repo, raiser, outbox } = setup(proposedQuote());
    expect(await command.execute({ quoteId: "q-1" })).toBe("expired");
    expect(repo.state?.expiredCause).toBe("proposal_lapsed");
    expect(outbox.published[0]?.insideTransaction).toBe(true);
    expect(raiser.raised[0]).toMatchObject({ type: NotificationType.ProviderQuoteExpired, audience: "provider", providerId: "prov-1" });
    expect(raiser.insideTransactionAtCall).toEqual([false]);
  });

  it("does nothing to a quote that already moved on, and announces nothing", async () => {
    const closed = requestedQuote().decline(new Date(), "user-right-1", "other", null);
    const { command, repo, raiser } = setup(closed);
    expect(await command.execute({ quoteId: "q-1" })).toBe("noop");
    expect(repo.saveCalls).toBe(0);
    expect(raiser.raised).toHaveLength(0);
  });
});

describe("SweepDueQuotesInternalCommand", () => {
  it("counts what it settled and lets one bad row pass without stopping", async () => {
    const good = withId(requestedQuote(), "q-1");
    const repo = { async findDueForSweep() { return [good, good]; } };
    let call = 0;
    const one = { async execute() { call += 1; if (call === 1) throw new Error("boom"); return "expired" as const; } };
    const command = new SweepDueQuotesInternalCommand(repo as never, one as never);
    expect(await command.execute({ limit: 200 })).toEqual({ swept: 1, failed: 1 });
  });
});
