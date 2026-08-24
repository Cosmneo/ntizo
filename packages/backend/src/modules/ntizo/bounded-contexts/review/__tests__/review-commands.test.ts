import { describe, expect, it } from "bun:test";
import { Review } from "../domain/aggregates/review.aggregate";
import {
  CannotReviewOwnBusinessError,
  ProviderNotReviewableError,
  ReviewNotEarnedError,
  ReviewNotFoundError,
} from "../domain/exceptions";
import { RemoveReviewCommand, SubmitReviewCommand } from "../app/use-cases/submit-review.command";
import type {
  ReviewRepositoryPort,
  ReviewRow,
  ReviewSummary,
} from "../app/ports/outbound/review.repository.port";
import type {
  ReviewEligibility,
  ReviewEligibilityPort,
} from "../app/ports/outbound/review-eligibility.port";

class FakeRepo implements ReviewRepositoryPort {
  public upserted: Review | null = null;
  public removed: string | null = null;

  constructor(
    private readonly opts: {
      reviewable?: boolean;
      works?: boolean;
      existing?: Review | null;
      deletes?: boolean;
    } = {},
  ) {}

  async findByAuthor(): Promise<Review | null> {
    return this.opts.existing ?? null;
  }
  async upsert(entity: Review): Promise<string> {
    this.upserted = entity;
    return "r1";
  }
  async removeOwn(providerId: string): Promise<boolean> {
    this.removed = providerId;
    return this.opts.deletes ?? true;
  }
  async listPublished(): Promise<ReviewRow[]> {
    return [];
  }
  async summary(): Promise<ReviewSummary> {
    return { average: null, count: 0, histogram: { one: 0, two: 0, three: 0, four: 0, five: 0 } };
  }
  async isReviewableProvider(): Promise<boolean> {
    return this.opts.reviewable ?? true;
  }
  async worksAtProvider(): Promise<boolean> {
    return this.opts.works ?? false;
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

const INPUT = { requesterUserId: "u1", providerId: "p1", rating: 5, comment: "bom" };

describe("SubmitReviewCommand", () => {
  it("writes a first review, carrying the booking that earned it", async () => {
    const repo = new FakeRepo();
    const eligibility = new FakeEligibility({ allowed: true, bookingId: "b7" });

    const result = await new SubmitReviewCommand(repo, eligibility).execute(INPUT);

    expect(result.reviewId).toBe("r1");
    expect(repo.upserted?.rating).toBe(5);
    // Stored on the review so a later reader can tell a verdict backed by a
    // real job from one written before the rule existed.
    expect(repo.upserted?.bookingId).toBe("b7");
  });

  it("refuses a business that is not trading, before asking anything else", async () => {
    const repo = new FakeRepo({ reviewable: false, works: true });
    const eligibility = new FakeEligibility();

    await expect(new SubmitReviewCommand(repo, eligibility).execute(INPUT)).rejects.toThrow(
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
      new SubmitReviewCommand(repo, new FakeEligibility()).execute(INPUT),
    ).rejects.toThrow(CannotReviewOwnBusinessError);
    expect(repo.upserted).toBeNull();
  });

  it("refuses a first review from somebody who has not been served", async () => {
    const repo = new FakeRepo();
    const eligibility = new FakeEligibility({ allowed: false, bookingId: null });

    await expect(new SubmitReviewCommand(repo, eligibility).execute(INPUT)).rejects.toThrow(
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

    await new SubmitReviewCommand(repo, eligibility).execute(INPUT);

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
