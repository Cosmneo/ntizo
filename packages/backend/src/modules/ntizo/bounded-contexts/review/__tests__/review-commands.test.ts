import { describe, expect, it } from "bun:test";
import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import type { BaseDomainEvent } from "@cosmneo/onion-lasagna";
import { Review } from "../domain/aggregates/review.aggregate";
import {
  CannotReviewOwnBusinessError,
  ProviderNotReviewableError,
  ReviewNotEarnedError,
  ReviewNotFoundError,
  ReviewToFeatureNotFoundError,
  TooManyFeaturedReviewsError,
} from "../domain/exceptions";
import { RemoveReviewCommand, SubmitReviewCommand } from "../app/use-cases/submit-review.command";
import { SetReviewFeaturedCommand } from "../app/use-cases/set-review-featured.command";
import { MAX_FEATURED } from "../app/use-cases/read-featured-reviews.query";
import type {
  AdminReviewRow,
  FeaturedReviewRow,
  ReviewRepositoryPort,
  ReviewRow,
  ReviewSummary,
  UpsertedReview,
} from "../app/ports/outbound/review.repository.port";
import type {
  ReviewEligibility,
  ReviewEligibilityPort,
} from "../app/ports/outbound/review-eligibility.port";
import type { CompleteBookingPort } from "../app/ports/outbound/complete-booking.port";
import type { OutboxPort } from "../../../shared/app/ports/outbox.port";
// The booking context's own refusal, imported into a *test* — never into
// this context's `app/` or `domain/` tree, which is where the no-cross-context
// rule bites. It is what the command behind `CompleteBookingPort` really
// throws when the sweep closed the booking a second before the review
// reached it (`Booking.complete` refuses from `COMPLETED`), and inventing a
// generic `Error` here would make the swallow test about a failure that never
// happens instead of the one that will.
import { BookingTransitionError } from "../../booking/domain/exceptions";

/**
 * Flips `insideTransaction` around `work()`, and resets an `order` log at the
 * start of every call, so `FakeRepo.upsert` and `CapturingOutbox.publish` can
 * each stamp themselves onto it. Mirrors `service-commands.test.ts`'s
 * `TrackingUnitOfWork` — a fake that just runs `work()` inline cannot tell
 * "published inside the transaction, after the write" apart from "published
 * outside it, or before the write", which is exactly the gap Task 4 paid for.
 */
class TrackingUnitOfWork implements UnitOfWorkPort {
  insideTransaction = false;
  order: string[] = [];

  async atomicExecute<T>(work: () => Promise<T>): Promise<T> {
    this.insideTransaction = true;
    this.order = [];
    try {
      return await work();
    } finally {
      this.insideTransaction = false;
    }
  }
}

class FakeRepo implements ReviewRepositoryPort {
  public upserted: Review | null = null;
  public removed: string | null = null;
  public featured: { reviewId: string; featured: boolean } | null = null;

  constructor(
    private readonly opts: {
      reviewable?: boolean;
      works?: boolean;
      existing?: Review | null;
      deletes?: boolean;
      providerName?: string;
      /**
       * What `upsert` reports it did. Defaults to the opposite of
       * `existing` — an uncontested request behaves exactly as the read
       * predicted. Overriding this independently of `existing` is what lets
       * a test express the double-submit race: `findByAuthor` said
       * "nothing here" (`existing` unset) but by the time this call's
       * `upsert` actually ran, a racing submission had already inserted the
       * row, so Postgres reports an update (`inserted: false`) despite the
       * read never having seen it.
       */
      inserted?: boolean;
      /**
       * How many reviews are already on the home page, for the cap check in
       * `SetReviewFeaturedCommand`. Only that command reads it.
       */
      featuredCount?: number;
      /** Whether the row `setFeatured` was pointed at exists. */
      featureTargetExists?: boolean;
    } = {},
    private readonly unitOfWork?: TrackingUnitOfWork,
  ) {}

  async findByAuthor(): Promise<Review | null> {
    return this.opts.existing ?? null;
  }
  async upsert(entity: Review): Promise<UpsertedReview> {
    this.upserted = entity;
    this.unitOfWork?.order.push("upsert");
    return { id: "r1", inserted: this.opts.inserted ?? !this.opts.existing };
  }
  async removeOwn(providerId: string): Promise<boolean> {
    this.removed = providerId;
    return this.opts.deletes ?? true;
  }
  async listPublished(): Promise<ReviewRow[]> {
    return [];
  }
  async listFeatured(): Promise<FeaturedReviewRow[]> {
    return [];
  }
  async listForAdmin(): Promise<{
    items: AdminReviewRow[];
    total: number;
    featuredCount: number;
  }> {
    return { items: [], total: 0, featuredCount: this.opts.featuredCount ?? 0 };
  }
  async setFeatured(reviewId: string, featured: boolean): Promise<boolean> {
    this.featured = { reviewId, featured };
    return this.opts.featureTargetExists ?? true;
  }
  async summary(): Promise<ReviewSummary> {
    return { average: null, count: 0, histogram: { one: 0, two: 0, three: 0, four: 0, five: 0 } };
  }
  async isReviewableProvider(): Promise<{ name: string } | null> {
    if (this.opts.reviewable === false) return null;
    return { name: this.opts.providerName ?? "Barbearia do João" };
  }
  async worksAtProvider(): Promise<boolean> {
    return this.opts.works ?? false;
  }
}

/**
 * Records what `SubmitReviewCommand` actually hands the outbox, plus — per
 * batch — whether that call landed inside `unitOfWork.atomicExecute` and
 * after `repo.upsert` had already run within that same cycle. Mirrors
 * `service-commands.test.ts`'s `CapturingOutbox`: a fake asserting only "was
 * publish called" cannot catch a publish moved outside the transaction, or
 * ahead of the write but still inside it — both look identical to it.
 */
class CapturingOutbox implements OutboxPort {
  published: {
    events: BaseDomainEvent[];
    aggregateType: string;
    insideTransaction: boolean;
    afterUpsert: boolean;
  }[] = [];

  constructor(private readonly unitOfWork: TrackingUnitOfWork) {}

  async publish(events: BaseDomainEvent[], aggregateType: string): Promise<void> {
    this.published.push({
      events,
      aggregateType,
      insideTransaction: this.unitOfWork.insideTransaction,
      afterUpsert: this.unitOfWork.order.includes("upsert"),
    });
    this.unitOfWork.order.push("publish");
  }
}

class FakeEligibility implements ReviewEligibilityPort {
  public asked = 0;
  constructor(private readonly verdict: ReviewEligibility = { allowed: true, bookingId: null }) {}
  async check(): Promise<ReviewEligibility> {
    this.asked += 1;
    return this.verdict;
  }
}

/**
 * Records every booking this command asked to close, and — per call — whether
 * it asked from inside `unitOfWork.atomicExecute`. The second half is the
 * point: closing a booking is a write in *another* bounded context, so doing
 * it inside this one's transaction would hold that transaction open across a
 * foreign call and, worse, would let a rollback here take back a booking
 * closure the other side has already announced. A fake asserting only "was
 * complete called" cannot tell that apart.
 *
 * `failWith` makes the port refuse, which is the case that decides whether a
 * review survives a booking that will not close.
 */
class FakeCompleteBooking implements CompleteBookingPort {
  public calls: { bookingId: string; requesterUserId: string }[] = [];
  public insideTransaction: boolean[] = [];
  public failWith: Error | null = null;

  constructor(private readonly unitOfWork?: TrackingUnitOfWork) {}

  async execute(input: { bookingId: string; requesterUserId: string }): Promise<void> {
    this.calls.push(input);
    this.insideTransaction.push(this.unitOfWork?.insideTransaction ?? false);
    if (this.failWith) throw this.failWith;
  }
}

const INPUT = { requesterUserId: "u1", providerId: "p1", rating: 5, comment: "bom" };

/** The reviewer in the completion tests below — the booking's own customer. */
const CUSTOMER_ID = "cus-1";

/**
 * `SubmitReviewCommand` now takes a `UnitOfWorkPort`, an `OutboxPort` and a
 * `CompleteBookingPort` — every test below that does not care about any of
 * them gets a fresh, unshared set from this helper, exactly as
 * `decide-provider-status.command.test.ts` does for the tests that predate
 * its own outbox wiring.
 */
function command(
  repo: ReviewRepositoryPort,
  eligibility: ReviewEligibilityPort,
  completeBooking: CompleteBookingPort = new FakeCompleteBooking(),
): SubmitReviewCommand {
  const unitOfWork = new TrackingUnitOfWork();
  return new SubmitReviewCommand(
    repo,
    eligibility,
    unitOfWork,
    new CapturingOutbox(unitOfWork),
    completeBooking,
  );
}

describe("SubmitReviewCommand", () => {
  it("writes a first review, carrying the booking that earned it", async () => {
    const repo = new FakeRepo();
    const eligibility = new FakeEligibility({ allowed: true, bookingId: "b7" });

    const result = await command(repo, eligibility).execute(INPUT);

    expect(result.reviewId).toBe("r1");
    expect(repo.upserted?.rating).toBe(5);
    // Stored on the review so a later reader can tell a verdict backed by a
    // real job from one written before the rule existed.
    expect(repo.upserted?.bookingId).toBe("b7");
  });

  it("refuses a business that is not trading, before asking anything else", async () => {
    const repo = new FakeRepo({ reviewable: false, works: true });
    const eligibility = new FakeEligibility();

    await expect(command(repo, eligibility).execute(INPUT)).rejects.toThrow(
      ProviderNotReviewableError,
    );
    // Existence is checked first so somebody probing ids learns nothing about
    // who works where.
    expect(eligibility.asked).toBe(0);
  });

  it("refuses somebody who works there", async () => {
    // The cheapest way to fake a five-star average is to award it to yourself.
    const repo = new FakeRepo({ works: true });
    await expect(
      command(repo, new FakeEligibility()).execute(INPUT),
    ).rejects.toThrow(CannotReviewOwnBusinessError);
    expect(repo.upserted).toBeNull();
  });

  it("refuses a first review from somebody who has not been served", async () => {
    const repo = new FakeRepo();
    const eligibility = new FakeEligibility({ allowed: false, bookingId: null });

    await expect(command(repo, eligibility).execute(INPUT)).rejects.toThrow(
      ReviewNotEarnedError,
    );
    expect(repo.upserted).toBeNull();
  });

  it("lets somebody who already reviewed change their mind, without re-earning it", async () => {
    // Taking that right away would freeze a bad score in place the day the
    // eligibility rule changes under them.
    const existing = Review.create({
      providerId: "p1",
      authorUserId: "u1",
      bookingId: "b1",
      rating: 1,
      comment: "mau",
    });
    const repo = new FakeRepo({ existing });
    const eligibility = new FakeEligibility({ allowed: false, bookingId: null });

    await command(repo, eligibility).execute(INPUT);

    expect(eligibility.asked).toBe(0);
    expect(repo.upserted?.rating).toBe(5);
    // The original booking survives the edit rather than being cleared by the
    // refusing verdict this call never asked for.
    expect(repo.upserted?.bookingId).toBe("b1");
  });
});

describe("RemoveReviewCommand", () => {
  it("removes the caller's own review", async () => {
    const repo = new FakeRepo({ deletes: true });
    await expect(
      new RemoveReviewCommand(repo).execute({ requesterUserId: "u1", providerId: "p1" }),
    ).resolves.toEqual({ ok: true });
    expect(repo.removed).toBe("p1");
  });

  it("reports that there was nothing to remove rather than confirming", async () => {
    // A click that removes nothing must not read as "worked".
    const repo = new FakeRepo({ deletes: false });
    await expect(
      new RemoveReviewCommand(repo).execute({ requesterUserId: "u1", providerId: "p1" }),
    ).rejects.toThrow(ReviewNotFoundError);
  });
});

// ---------------------------------------------------------------------------
// The review context had no event-recording machinery at all — Task 5 gave it
// one, `ReviewCreated` (see `review-created-event.test.ts` for the event
// class itself). The lesson Task 4 paid for is that raising an event is only
// half the job: `Service.pullEvents()` existed and had exactly one caller,
// a test, because neither catalog command actually published to the outbox.
// This block asks the question that catches that: does `SubmitReviewCommand`
// actually hand `ReviewCreated` to the outbox port, inside the transaction
// that writes the review, and after that write — not merely "was the event
// constructed".
// ---------------------------------------------------------------------------

describe("the outbox", () => {
  it("a first review publishes ReviewCreated, inside the transaction, after the upsert", async () => {
    const unitOfWork = new TrackingUnitOfWork();
    const outbox = new CapturingOutbox(unitOfWork);
    const repo = new FakeRepo({ providerName: "Barbearia do João" }, unitOfWork);
    const eligibility = new FakeEligibility({ allowed: true, bookingId: "b7" });

    const { reviewId } = await new SubmitReviewCommand(
      repo,
      eligibility,
      unitOfWork,
      outbox,
      new FakeCompleteBooking(),
    ).execute(INPUT);

    expect(outbox.published).toHaveLength(1);
    const batch = outbox.published[0]!;
    expect(batch.aggregateType).toBe("review");
    expect(batch.insideTransaction).toBe(true);
    expect(batch.afterUpsert).toBe(true);

    expect(batch.events).toHaveLength(1);
    const event = batch.events[0]!;
    expect(event.eventName).toBe("review.created");
    expect(event.payload).toEqual({
      reviewId,
      providerId: INPUT.providerId,
      providerName: "Barbearia do João",
      rating: INPUT.rating,
      actorUserId: INPUT.requesterUserId,
    });
  });

  it("a double-submit publishes ReviewCreated once, not twice — the write decides, not the read", async () => {
    // The race review.repository.ts's own upsert docblock names: two
    // submissions can both run findByAuthor before either transaction
    // commits, so both see "nothing here" and both take the create path.
    // Only the first to actually reach the database inserts; the second
    // resolves through ON CONFLICT ... DO UPDATE. This call simulates being
    // that second one — `existing` is unset (the read said "new"), but
    // `inserted: false` (the write says otherwise). Branching the publish
    // on `existing`, the way this command used to, would publish here; the
    // real bug this guards is the SAME review publishing ReviewCreated
    // twice across the two racing calls.
    const unitOfWork = new TrackingUnitOfWork();
    const outbox = new CapturingOutbox(unitOfWork);
    const repo = new FakeRepo({ inserted: false }, unitOfWork);
    const eligibility = new FakeEligibility({ allowed: true, bookingId: "b7" });

    await new SubmitReviewCommand(repo, eligibility, unitOfWork, outbox, new FakeCompleteBooking()).execute(INPUT);

    expect(repo.upserted).not.toBeNull();
    expect(outbox.published).toHaveLength(0);
  });

  it("editing an existing review publishes nothing — it is a revision, not a creation", async () => {
    const existing = Review.create({
      providerId: "p1",
      authorUserId: "u1",
      bookingId: "b1",
      rating: 1,
      comment: "mau",
    });
    const unitOfWork = new TrackingUnitOfWork();
    const outbox = new CapturingOutbox(unitOfWork);
    const repo = new FakeRepo({ existing }, unitOfWork);
    const eligibility = new FakeEligibility({ allowed: false, bookingId: null });

    await new SubmitReviewCommand(repo, eligibility, unitOfWork, outbox, new FakeCompleteBooking()).execute(INPUT);

    expect(repo.upserted).not.toBeNull();
    expect(outbox.published).toHaveLength(0);
  });

  it("a refused submission — provider not reviewable — publishes nothing", async () => {
    const unitOfWork = new TrackingUnitOfWork();
    const outbox = new CapturingOutbox(unitOfWork);
    const repo = new FakeRepo({ reviewable: false }, unitOfWork);

    await expect(
      new SubmitReviewCommand(repo, new FakeEligibility(), unitOfWork, outbox, new FakeCompleteBooking()).execute(INPUT),
    ).rejects.toThrow(ProviderNotReviewableError);

    expect(outbox.published).toHaveLength(0);
  });

  it("a refused submission — reviewer works there — publishes nothing", async () => {
    const unitOfWork = new TrackingUnitOfWork();
    const outbox = new CapturingOutbox(unitOfWork);
    const repo = new FakeRepo({ works: true }, unitOfWork);

    await expect(
      new SubmitReviewCommand(repo, new FakeEligibility(), unitOfWork, outbox, new FakeCompleteBooking()).execute(INPUT),
    ).rejects.toThrow(CannotReviewOwnBusinessError);

    expect(outbox.published).toHaveLength(0);
  });

  it("a refused first review — not earned — publishes nothing", async () => {
    const unitOfWork = new TrackingUnitOfWork();
    const outbox = new CapturingOutbox(unitOfWork);
    const repo = new FakeRepo({}, unitOfWork);
    const eligibility = new FakeEligibility({ allowed: false, bookingId: null });

    await expect(
      new SubmitReviewCommand(repo, eligibility, unitOfWork, outbox, new FakeCompleteBooking()).execute(INPUT),
    ).rejects.toThrow(ReviewNotEarnedError);

    expect(outbox.published).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// The customer's review IS the validation. A booking the provider marked done
// opens a three-day window in which the customer may dispute the work; the
// sweep closes it when they do not. Writing a review is that customer saying
// the work happened, so it closes the window immediately rather than making
// them press a second button for something they have already answered.
//
// What these tests pin is not "complete was called" but the four things that
// decide whether that call is safe: which booking (the caller's own, the one
// eligibility handed back), when (after the review's transaction resolved,
// never inside it), that a refusal cannot take the review down with it, and
// that nothing at all is closed on any path that did not write a new review.
// ---------------------------------------------------------------------------

describe("the booking a review closes", () => {
  const COMPLETION_INPUT = {
    providerId: "prov-1",
    requesterUserId: CUSTOMER_ID,
    rating: 5,
    comment: "óptimo",
  };

  it("completes the booking it was written about", async () => {
    const repo = new FakeRepo();
    const eligibility = new FakeEligibility({ allowed: true, bookingId: "bk-1" });
    const completeBooking = new FakeCompleteBooking();

    await command(repo, eligibility, completeBooking).execute(COMPLETION_INPUT);

    // The booking id is the one `ReviewEligibilityPort` returned for THIS
    // requester, which is what makes the call safe without the booking
    // context re-checking: that query is keyed on `customerId = requester`,
    // so it can only ever hand back a booking of the caller's own. Both
    // fields are asserted together for that reason — a call carrying the
    // right booking and the wrong person would close somebody else's job in
    // their name.
    expect(completeBooking.calls).toEqual([{ bookingId: "bk-1", requesterUserId: CUSTOMER_ID }]);
  });

  it("closes the booking after the transaction that wrote the review, never inside it", async () => {
    // A write in another bounded context, made from inside this one's
    // transaction, would hold that transaction open across a foreign call and
    // let a rollback here take back a closure the other side already
    // announced. Same discipline every booking command keeps for its own
    // notifications.
    const unitOfWork = new TrackingUnitOfWork();
    const outbox = new CapturingOutbox(unitOfWork);
    const repo = new FakeRepo({}, unitOfWork);
    const eligibility = new FakeEligibility({ allowed: true, bookingId: "bk-1" });
    const completeBooking = new FakeCompleteBooking(unitOfWork);

    await new SubmitReviewCommand(
      repo,
      eligibility,
      unitOfWork,
      outbox,
      completeBooking,
    ).execute(COMPLETION_INPUT);

    expect(completeBooking.insideTransaction).toEqual([false]);
  });

  it("does not fail the review when the booking refuses to complete", async () => {
    // The realistic refusal: the sweep's own window arm closed this booking a
    // second earlier, so `Booking.complete` refuses from `COMPLETED`.
    const repo = new FakeRepo();
    const eligibility = new FakeEligibility({ allowed: true, bookingId: "bk-1" });
    const completeBooking = new FakeCompleteBooking();
    completeBooking.failWith = new BookingTransitionError("COMPLETED", "COMPLETED");

    await expect(
      command(repo, eligibility, completeBooking).execute({
        providerId: "prov-1",
        requesterUserId: CUSTOMER_ID,
        rating: 5,
        comment: null,
      }),
    ).resolves.toBeDefined();

    // And the review really is there — a caller that resolved having thrown
    // the review away would satisfy the line above and satisfy nobody else.
    expect(repo.upserted).not.toBeNull();
    expect(completeBooking.calls).toHaveLength(1);
  });

  it("logs the booking it could not close, so a window left open is not silent", async () => {
    const repo = new FakeRepo();
    const eligibility = new FakeEligibility({ allowed: true, bookingId: "bk-1" });
    const completeBooking = new FakeCompleteBooking();
    completeBooking.failWith = new BookingTransitionError("COMPLETED", "COMPLETED");

    const seen: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      seen.push(args);
    };
    // try/finally, not a bare restore after the await, for the reason
    // `record-activity.test.ts` gives: this is the test proving `execute`
    // survives the refusal, so if that guarantee ever broke an unguarded
    // restore below a rejected await would never run and the patched
    // `console.error` would leak into every test after this one.
    try {
      await command(repo, eligibility, completeBooking).execute({
        providerId: "prov-1",
        requesterUserId: CUSTOMER_ID,
        rating: 5,
        comment: null,
      });
    } finally {
      console.error = original;
    }

    expect(seen).toHaveLength(1);
    // The booking id has to be IN the line, or a booking silently left open
    // cannot be found from the logs — which is the entire reason the swallow
    // is acceptable.
    expect(String(seen[0]![0])).toContain("bk-1");
  });

  it("completes nothing when the review was a revision, not a new one", async () => {
    // Changing one's mind about a business is not new evidence that the job
    // happened, and the booking it points at was closed the first time round.
    const existing = Review.create({
      providerId: "prov-1",
      authorUserId: CUSTOMER_ID,
      bookingId: "bk-1",
      rating: 1,
      comment: "mau",
    });
    const repo = new FakeRepo({ existing });
    const eligibility = new FakeEligibility({ allowed: false, bookingId: null });
    const completeBooking = new FakeCompleteBooking();

    await command(repo, eligibility, completeBooking).execute({
      providerId: "prov-1",
      requesterUserId: CUSTOMER_ID,
      rating: 4,
      comment: null,
    });

    expect(repo.upserted).not.toBeNull();
    expect(completeBooking.calls).toEqual([]);
  });

  it("closes the booking the vanished review pointed at, when a revision turns out to have inserted", async () => {
    // `let bookingId = existing?.bookingId ?? null` was dead weight before
    // this task — the revision path builds its aggregate with
    // `existing.revise()`, which carries `this.props.bookingId`, so the local
    // never reached the write. It is load-bearing now, on exactly one path:
    // `findByAuthor` found a review, the author deleted it (`removeOwn`)
    // before this transaction's upsert ran, so Postgres inserted rather than
    // updated and `inserted` comes back true on what this call treated as a
    // revision. The booking closed is then the one the vanished review
    // pointed at.
    //
    // Safe, and this test is where that is written down: `findByAuthor` is
    // keyed on `(providerId, authorUserId)`, so the row was this caller's
    // own, and its `booking_id` was written from a verdict keyed on this same
    // customer. The eligibility port is never consulted on this path —
    // `asked` is 0 below — so the id can only have come from that review.
    const existing = Review.create({
      providerId: "prov-1",
      authorUserId: CUSTOMER_ID,
      bookingId: "bk-9",
      rating: 1,
      comment: "mau",
    });
    const repo = new FakeRepo({ existing, inserted: true });
    const eligibility = new FakeEligibility({ allowed: false, bookingId: null });
    const completeBooking = new FakeCompleteBooking();

    await command(repo, eligibility, completeBooking).execute({
      providerId: "prov-1",
      requesterUserId: CUSTOMER_ID,
      rating: 4,
      comment: null,
    });

    expect(eligibility.asked).toBe(0);
    expect(completeBooking.calls).toEqual([{ bookingId: "bk-9", requesterUserId: CUSTOMER_ID }]);
    // The provenance link survives the rewrite too — `revise()` carries the
    // original booking onto the row this call writes, so the review that
    // replaces the vanished one still points at the job that earned it.
    expect(repo.upserted?.bookingId).toBe("bk-9");
  });

  it("completes nothing when the write says another submission got there first", async () => {
    // The double-submit race `review.repository.ts` names: `findByAuthor` saw
    // nothing, but by the time this call's `upsert` ran a racing submission
    // had already inserted the row, so Postgres reports an update. The write
    // decides, not the read — the same rule that governs `ReviewCreated`
    // above, and for the same reason: the racing call already closed it.
    const repo = new FakeRepo({ inserted: false });
    const eligibility = new FakeEligibility({ allowed: true, bookingId: "bk-1" });
    const completeBooking = new FakeCompleteBooking();

    await command(repo, eligibility, completeBooking).execute({
      providerId: "prov-1",
      requesterUserId: CUSTOMER_ID,
      rating: 4,
      comment: null,
    });

    expect(repo.upserted).not.toBeNull();
    expect(completeBooking.calls).toEqual([]);
  });

  it("completes nothing when eligibility named no booking to close", async () => {
    // `allowed` without a `bookingId` is what the old open adapter answered
    // and what any future adapter that says yes on some other ground would
    // answer. There is no job to close, and `bookingId!` would send a literal
    // "undefined" across the boundary.
    const repo = new FakeRepo();
    const eligibility = new FakeEligibility({ allowed: true, bookingId: null });
    const completeBooking = new FakeCompleteBooking();

    await command(repo, eligibility, completeBooking).execute(COMPLETION_INPUT);

    expect(repo.upserted).not.toBeNull();
    expect(completeBooking.calls).toEqual([]);
  });

  it("completes nothing when the submission was refused", async () => {
    // No review was written, so nothing validated anything. Asserted on the
    // not-earned refusal specifically, because that is the one whose input
    // carries a booking-shaped verdict at all.
    const repo = new FakeRepo();
    const eligibility = new FakeEligibility({ allowed: false, bookingId: null });
    const completeBooking = new FakeCompleteBooking();

    await expect(
      command(repo, eligibility, completeBooking).execute(COMPLETION_INPUT),
    ).rejects.toThrow(ReviewNotEarnedError);

    expect(repo.upserted).toBeNull();
    expect(completeBooking.calls).toEqual([]);
  });
});

describe("SetReviewFeaturedCommand", () => {
  it("marks a review as shown on the home page", async () => {
    const repo = new FakeRepo({ featuredCount: 0 });
    const result = await new SetReviewFeaturedCommand(repo).execute({
      reviewId: "r1",
      featured: true,
    });

    expect(result).toEqual({ featured: true });
    expect(repo.featured).toEqual({ reviewId: "r1", featured: true });
  });

  it("refuses to feature a fifth review", async () => {
    // The rail draws four. Without the cap an administrator can mark forty and
    // the four that appear are decided by a timestamp they cannot see.
    const repo = new FakeRepo({ featuredCount: MAX_FEATURED });

    await expect(
      new SetReviewFeaturedCommand(repo).execute({ reviewId: "r5", featured: true }),
    ).rejects.toBeInstanceOf(TooManyFeaturedReviewsError);
    // Refused before the write, not after it.
    expect(repo.featured).toBeNull();
  });

  it("always allows unfeaturing, even at the cap", async () => {
    // Taking something off a full shelf is exactly what somebody who just hit
    // the cap needs to do next.
    const repo = new FakeRepo({ featuredCount: MAX_FEATURED });
    const result = await new SetReviewFeaturedCommand(repo).execute({
      reviewId: "r1",
      featured: false,
    });

    expect(result).toEqual({ featured: false });
    expect(repo.featured).toEqual({ reviewId: "r1", featured: false });
  });

  it("reports a review that is not there rather than a success that changed nothing", async () => {
    const repo = new FakeRepo({ featuredCount: 0, featureTargetExists: false });

    await expect(
      new SetReviewFeaturedCommand(repo).execute({ reviewId: "gone", featured: true }),
    ).rejects.toBeInstanceOf(ReviewToFeatureNotFoundError);
  });
});
