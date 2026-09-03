import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import type { ContactRequestAdminDTO } from "@ntizo/shared/read-models";
import { AdminContactPage } from "../contact-page";

const fakes = vi.hoisted(() => ({ setStatus: vi.fn() }));
vi.mock("@/features/admin/contact/data/admin-contact.repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/admin/contact/data/admin-contact.repository")>();
  return { ...actual, setContactRequestStatus: fakes.setStatus };
});

function row(over: Partial<ContactRequestAdminDTO> = {}): ContactRequestAdminDTO {
  return {
    id: "7f3a2c9e-1b2d-4e5f-8a9b-0c1d2e3f4a5b", reference: "7F3A2C", kind: "contact", topic: "partnership",
    name: "Joana Matola", email: "joana@exemplo.com", message: "Gostava de propor uma parceria com a minha escola.",
    requesterUserId: "u-1", locale: "pt-MZ", originPath: null, ipAddress: "197.218.0.1", userAgent: "Mozilla/5.0",
    status: "open", resolvedAt: null, createdAt: "2026-09-02T10:00:00.000Z", ...over,
  };
}

// `await router.load()` before `render()`: this router commits its first
// match through an async transition, matching the idiom in
// `src/features/landing/ui/__tests__/footer.test.tsx`.
async function renderPage(items: ContactRequestAdminDTO[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // The default search: first page, open only. Seeded so no fetch happens.
  qc.setQueryData(["admin", "contact", { offset: 0, status: "open" }], { items, total: items.length, openCount: items.length });
  const rootRoute = createRootRoute();
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: "/", component: AdminContactPage }),
      createRoute({ getParentRoute: () => rootRoute, path: "/admin/users", component: () => <p>users</p> }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return qc;
}

/**
 * `CollectionCard` renders every row twice — once into the desktop table,
 * once into the mobile card list — and jsdom evaluates neither the `hidden`
 * utility class nor the `md:` breakpoint (`window.matchMedia` is stubbed to
 * "nothing matches" in `src/test/setup.ts`), so both copies are visible to
 * queries at once. `collection-card.test.tsx` asserts this directly
 * (`getAllByText(...)` returns length 2). Scoping to the `<table>` — the one
 * region a row's facts appear in exactly once — resolves the ambiguity
 * without changing the page.
 */
function table() {
  return screen.getByRole("table");
}

beforeEach(() => fakes.setStatus.mockReset().mockResolvedValue(undefined));

describe("AdminContactPage", () => {
  it("lists a request with its kind, topic, who wrote, and the reference", async () => {
    await renderPage([row()]);
    const t = within(table());
    expect(t.getByText("Joana Matola")).toBeInTheDocument();
    // A regex, not the plain string: the email sits beside the locale in one
    // `<p>{email} · {locale}</p>`, three sibling text nodes under one
    // element, so the node's own text is "joana@exemplo.com · pt-MZ" and an
    // exact-string match against just the email finds no element — the kind
    // of "text is broken up by multiple elements" case Testing Library's own
    // error names. A regex matches the substring instead.
    expect(t.getByText(/joana@exemplo\.com/)).toBeInTheDocument();
    expect(t.getByText("Partnership")).toBeInTheDocument();
    expect(t.getByText("#7F3A2C")).toBeInTheDocument();
    // Not part of a row, so it appears once regardless.
    expect(screen.getByText(/1 open request/)).toBeInTheDocument();
  });

  it("offers a reply by email with the reference in the subject", async () => {
    await renderPage([row()]);
    expect(within(table()).getByRole("link", { name: /reply by email/i })).toHaveAttribute(
      "href",
      "mailto:joana@exemplo.com?subject=%5BNtizo%20%237F3A2C%5D%20Partnership",
    );
  });

  it("marks a request resolved and refetches the queue", async () => {
    const qc = await renderPage([row()]);
    const spy = vi.spyOn(qc, "invalidateQueries");
    await userEvent.click(within(table()).getByRole("button", { name: /mark resolved/i }));
    await waitFor(() => expect(fakes.setStatus).toHaveBeenCalledWith("7f3a2c9e-1b2d-4e5f-8a9b-0c1d2e3f4a5b", "resolved"));
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ["admin", "contact"] }));
  });

  it("says the queue is empty in words", async () => {
    await renderPage([]);
    expect(within(table()).getByText("Nothing to answer.")).toBeInTheDocument();
  });

  it("expands a row to the whole message and where it came from", async () => {
    await renderPage([row({ kind: "feedback", topic: "problem", originPath: "/services/abc" })]);
    await userEvent.click(within(table()).getByRole("button", { name: /show details/i }));
    expect(within(table()).getByText("/services/abc")).toBeInTheDocument();
    expect(within(table()).getByText("197.218.0.1")).toBeInTheDocument();
  });
});
