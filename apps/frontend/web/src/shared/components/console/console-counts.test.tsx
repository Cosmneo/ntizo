import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const threads = vi.fn();
const providerCounts = vi.fn();
vi.mock("@/features/messaging/viewmodel/use-provider-threads", () => ({
  useProviderThreads: (id: string) => threads(id),
}));
vi.mock("@/features/admin/providers/viewmodel/use-admin-providers", () => ({
  useProviderStatusCounts: () => providerCounts(),
}));
vi.mock("@/features/provider/bookings/viewmodel/use-provider-bookings", () => ({
  useAwaitingCount: () => 3,
}));
vi.mock("@/features/provider/quotes/viewmodel/use-provider-quotes", () => ({
  useQuoteToAnswerCount: () => 5,
}));

const { ConsoleCountsProvider, useConsoleCounts } = await import("./console-counts");

function Probe() {
  return <pre data-testid="counts">{JSON.stringify(useConsoleCounts())}</pre>;
}

describe("ConsoleCountsProvider", () => {
  it("counts the loaded threads with something unread, and the requests awaiting an answer, for the workspace", () => {
    threads.mockReturnValue({ threads: [{ unreadCount: 2 }, { unreadCount: 0 }, { unreadCount: 1 }] });
    render(<ConsoleCountsProvider zone="workspace" providerId="p1"><Probe /></ConsoleCountsProvider>);
    expect(screen.getByTestId("counts")).toHaveTextContent(
      '{"unreadThreads":2,"bookingRequests":3,"quoteRequests":5}',
    );
    expect(threads).toHaveBeenCalledWith("p1");
  });

  it("asks for nothing while the workspace is still resolving", () => {
    threads.mockClear();
    render(<ConsoleCountsProvider zone="workspace" providerId=""><Probe /></ConsoleCountsProvider>);
    expect(screen.getByTestId("counts")).toHaveTextContent("{}");
    expect(threads).not.toHaveBeenCalled();
  });

  it("counts the pending applications, for the platform", () => {
    providerCounts.mockReturnValue({ data: { pending: 3, active: 9, rejected: 0, suspended: 1, archived: 0 } });
    render(<ConsoleCountsProvider zone="platform"><Probe /></ConsoleCountsProvider>);
    expect(screen.getByTestId("counts")).toHaveTextContent('{"pendingProviders":3}');
  });

  it("reports nothing for the platform while the counts are loading", () => {
    providerCounts.mockReturnValue({ data: undefined });
    render(<ConsoleCountsProvider zone="platform"><Probe /></ConsoleCountsProvider>);
    expect(screen.getByTestId("counts")).toHaveTextContent("{}");
  });
});
