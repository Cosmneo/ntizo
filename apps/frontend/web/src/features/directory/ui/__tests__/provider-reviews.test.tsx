import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ProviderReviewsPublicDTO } from "@ntizo/shared/read-models";

/**
 * The viewmodel hook is the seam, not the query cache — the same choice
 * `service-detail-page.test.tsx` documents: `boundaries/dependencies` forbids a
 * `ui/` file from importing `data/`, test files included, so there is no
 * `queryKey` to seed from here even if seeding were the better idea.
 *
 * `limit` is captured rather than ignored, because "see all" is a claim about
 * what the component asks for, not about what it renders.
 */
const state: { data: ProviderReviewsPublicDTO | undefined; lastLimit: number | undefined } = {
  data: undefined,
  lastLimit: undefined,
};

vi.mock("@/features/directory/viewmodel/use-directory", () => ({
  useProviderReviews: (_providerId: string, limit?: number) => {
    state.lastLimit = limit;
    return state.data;
  },
}));

const { ProviderReviews } = await import("../provider-reviews");

const summary = (count: number) => ({
  average: 4.8,
  count,
  histogram: { one: 0, two: 0, three: 0, four: 1, five: Math.max(count - 1, 0) },
});

const review = (id: string, over: Partial<ProviderReviewsPublicDTO["reviews"][number]> = {}) => ({
  id,
  rating: 5,
  comment: "Chegou a horas.",
  authorName: "Teresa Mondlane",
  createdAt: "2026-07-04T10:00:00Z",
  ...over,
});

function renderReviews(data: ProviderReviewsPublicDTO | undefined) {
  state.data = data;
  state.lastLimit = undefined;
  return render(<ProviderReviews providerId="p1" />);
}

describe("ProviderReviews", () => {
  it("renders nothing while the query has not answered", () => {
    const { container } = renderReviews(undefined);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when nobody has reviewed", () => {
    // An empty "Reviews (0)" over blank space says the business is untested in
    // the least generous way available. The directory card has already said
    // "no reviews yet" in words, which is enough.
    const { container } = renderReviews({ summary: summary(0), reviews: [] });
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the score and every comment it was given", () => {
    renderReviews({ summary: summary(4), reviews: [review("r1"), review("r2")] });
    expect(screen.getByText("4.8")).toBeInTheDocument();
    expect(screen.getAllByText("Teresa Mondlane")).toHaveLength(2);
    expect(screen.getAllByText("Chegou a horas.")).toHaveLength(2);
  });

  it("dates a review without naming a service", () => {
    // `review.booking_id` is always null and the booking row carries no
    // `service_id`, so there is nothing truthful to name. See the spec's
    // exclusion table.
    renderReviews({ summary: summary(1), reviews: [review("r1")] });
    expect(screen.getByText("July 4, 2026")).toBeInTheDocument();
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });

  it("names an author who set no display name without exposing them", () => {
    renderReviews({ summary: summary(1), reviews: [review("r1", { authorName: null })] });
    expect(screen.getByText("A customer")).toBeInTheDocument();
  });

  it("offers to load the rest only when there is a rest", () => {
    renderReviews({ summary: summary(2), reviews: [review("r1"), review("r2")] });
    expect(screen.queryByRole("button", { name: "See all reviews" })).not.toBeInTheDocument();
  });

  it("offers to load the rest when more exist than are shown", () => {
    renderReviews({ summary: summary(20), reviews: [review("r1")] });
    expect(screen.getByRole("button", { name: "See all reviews" })).toBeInTheDocument();
  });

  it("asks for the read model's whole cap when the button is used", async () => {
    renderReviews({ summary: summary(20), reviews: [review("r1")] });
    await userEvent.click(screen.getByRole("button", { name: "See all reviews" }));
    expect(state.lastLimit).toBe(50);
  });

  it("keeps saying how many are shown while more remain", () => {
    renderReviews({ summary: summary(80), reviews: [review("r1")] });
    expect(screen.getByText("Showing 1 of 80.")).toBeInTheDocument();
  });

  it("stops offering the button once the read model's cap is already showing", () => {
    // At 50 shown, clicking the button again would ask for the same limit it
    // already has — a re-request that changes nothing. The button reasoning
    // for that in `provider-reviews.tsx` needs a test, not just a doc comment,
    // or the next person can reason their way back out of the guard.
    const fifty = Array.from({ length: 50 }, (_, i) => review(`r${i}`));
    renderReviews({ summary: summary(80), reviews: fifty });
    expect(screen.getByText("Showing 50 of 80.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "See all reviews" })).not.toBeInTheDocument();
  });
});
