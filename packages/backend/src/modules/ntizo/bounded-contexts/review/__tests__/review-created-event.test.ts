import { describe, expect, it } from "bun:test";
import { ReviewCreated } from "../domain/events";

describe("ReviewCreated", () => {
  it("names the provider rather than only its id", () => {
    // The activity row renders "You reviewed X". An id would render the id.
    const e = new ReviewCreated({
      reviewId: "r1",
      providerId: "p1",
      providerName: "Barbearia do João",
      rating: 5,
      actorUserId: "u1",
    });
    expect(e.payload.providerName).toBe("Barbearia do João");
  });

  it("is about the review, and says who wrote it", () => {
    const e = new ReviewCreated({
      reviewId: "r1",
      providerId: "p1",
      providerName: "X",
      rating: 4,
      actorUserId: "u1",
    });
    expect(e.aggregateId).toBe("r1");
    expect(e.payload.actorUserId).toBe("u1");
  });

  it("is named review.created", () => {
    // The name is the key EventRouter fans out on. Renaming it silently
    // orphans every consumer, so it is pinned here.
    const e = new ReviewCreated({
      reviewId: "r1",
      providerId: "p1",
      providerName: "X",
      rating: 4,
      actorUserId: "u1",
    });
    expect(e.eventName).toBe("review.created");
  });
});
