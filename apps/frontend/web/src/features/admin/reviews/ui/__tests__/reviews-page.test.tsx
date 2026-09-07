import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReviewAdminDTO } from "@ntizo/shared/read-models";
import { AdminReviewsPage } from "../reviews-page";

function row(over: Partial<ReviewAdminDTO> = {}): ReviewAdminDTO {
  return {
    id: "r-1", providerId: "p-1", providerName: "Salão Polana", providerSlug: "salao-polana",
    rating: 5, comment: "Excelente atendimento.", authorName: "Ana Silva", status: "published",
    featuredAt: null, createdAt: "2026-09-03T10:00:00.000Z", ...over,
  };
}

function renderPage(items: ReviewAdminDTO[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // The default search — first page, everything — seeded so no fetch happens.
  qc.setQueryData(["admin", "reviews", { offset: 0 }], { items, total: items.length, featuredCount: 0 });
  render(
    <QueryClientProvider client={qc}>
      <AdminReviewsPage />
    </QueryClientProvider>,
  );
  return qc;
}

describe("AdminReviewsPage", () => {
  it("lists a review with who wrote it and what they said", () => {
    renderPage([row()]);
    const t = within(screen.getByRole("table"));
    expect(t.getByText("Ana Silva")).toBeInTheDocument();
    expect(t.getByText("Excelente atendimento.")).toBeInTheDocument();
  });

  it("keeps its filter in the shared panel, and asks for the home page's reviews as a different list", async () => {
    const user = userEvent.setup();
    const qc = renderPage([row()]);
    // Nothing loose above the card: the only way to the filter is the card's own button.
    expect(screen.queryByRole("button", { name: /on the home page/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^filter/i }));
    const panel = screen.getByRole("dialog", { name: "Filter reviews" });
    await user.click(within(panel).getByRole("button", { name: "Home page" }));
    await user.click(within(panel).getByRole("option", { name: "On the home page" }));

    // A different key, unseeded — the page must ask for it rather than show
    // the unfiltered list under a new label.
    expect(qc.getQueryData(["admin", "reviews", { offset: 0, featuredOnly: true }])).toBeUndefined();
    expect(within(screen.getByRole("button", { name: /^filter/i })).getByText("1")).toBeInTheDocument();
  });
});
