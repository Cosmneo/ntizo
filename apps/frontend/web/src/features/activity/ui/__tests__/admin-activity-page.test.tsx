import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PlatformActivityEntryDTO } from "@ntizo/shared/read-models";
import { AdminActivityPage } from "../admin-activity-page";

function entry(over: Partial<PlatformActivityEntryDTO> = {}): PlatformActivityEntryDTO {
  return {
    id: "a-1", type: "provider.status.decided", payload: { providerName: "Salão Polana", to: "active" },
    occurredAt: "2026-09-03T10:00:00.000Z", actorUserId: "u-1", actorName: "Ana Silva", actorEmail: "ana@ntizo.co.mz",
    ...over,
  };
}

function renderPage(items: PlatformActivityEntryDTO[], nextCursor: string | null = null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(["activity", "all", {}], { pages: [{ items, nextCursor }], pageParams: [undefined] });
  render(
    <QueryClientProvider client={qc}>
      <AdminActivityPage />
    </QueryClientProvider>,
  );
  return qc;
}

describe("AdminActivityPage", () => {
  it("lists what happened, as a sentence, with who did it under it, the kind and the time", () => {
    renderPage([entry()]);
    const t = within(screen.getByRole("table"));
    expect(t.getByText("Ana Silva · ana@ntizo.co.mz")).toBeInTheDocument();
    // The outcome, not the bare "reviewed": `to` picks the context key.
    expect(t.getByText("Approved Salão Polana")).toBeInTheDocument();
    expect(t.getByText("Provider decided")).toBeInTheDocument();
  });

  it("names a departed actor by a dash rather than an empty line", () => {
    renderPage([entry({ actorName: "", actorEmail: null })]);
    expect(within(screen.getByRole("table")).getByText("—", { selector: "p" })).toBeInTheDocument();
  });

  it("does not claim a total it cannot know while another page remains", () => {
    renderPage([entry()], "2026-09-03T10:00:00.000Z|a-1");
    expect(screen.getByText("1 shown")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load more" })).toBeInTheDocument();
  });

  it("keeps its filter in the shared panel, and asks for one kind as a different list", async () => {
    const user = userEvent.setup();
    const qc = renderPage([entry()]);
    await user.click(screen.getByRole("button", { name: /^filter/i }));
    const panel = screen.getByRole("dialog", { name: "Filter activity" });
    await user.click(within(panel).getByRole("button", { name: "Type" }));
    await user.click(within(panel).getByRole("option", { name: "Review posted" }));

    expect(qc.getQueryCache().find({ queryKey: ["activity", "all", { type: "review.created" }] })).toBeDefined();
    expect(within(screen.getByRole("button", { name: /^filter/i })).getByText("1")).toBeInTheDocument();
  });

  it("searches on the server", async () => {
    const user = userEvent.setup();
    const qc = renderPage([entry()]);
    await user.type(screen.getByPlaceholderText("Search a name, a service or an email"), "Polana");
    expect(qc.getQueryCache().find({ queryKey: ["activity", "all", { search: "Polana" }] })).toBeDefined();
  });
});
