import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const threads = vi.fn();
const adminProviders = vi.fn();
vi.mock("@/features/messaging/viewmodel/use-provider-threads", () => ({
  useProviderThreads: (id: string) => threads(id),
}));
vi.mock("@/features/admin/providers/viewmodel/use-admin-providers", () => ({
  useAdminProviders: (f: unknown) => adminProviders(f),
}));
vi.mock("@/features/provider/bookings/viewmodel/use-provider-bookings", () => ({
  useAwaitingCount: () => 3,
}));

const { ConsoleCountsProvider, useConsoleCounts } = await import("./console-counts");

function Probe() {
  return <pre data-testid="counts">{JSON.stringify(useConsoleCounts())}</pre>;
}

describe("ConsoleCountsProvider", () => {
  it("counts the loaded threads with something unread, and the requests awaiting an answer, for the workspace", () => {
    threads.mockReturnValue({ threads: [{ unreadCount: 2 }, { unreadCount: 0 }, { unreadCount: 1 }] });
    render(<ConsoleCountsProvider zone="workspace" providerId="p1"><Probe /></ConsoleCountsProvider>);
    expect(screen.getByTestId("counts")).toHaveTextContent('{"unreadThreads":2,"bookingRequests":3}');
    expect(threads).toHaveBeenCalledWith("p1");
  });

  it("asks for nothing while the workspace is still resolving", () => {
    threads.mockClear();
    render(<ConsoleCountsProvider zone="workspace" providerId=""><Probe /></ConsoleCountsProvider>);
    expect(screen.getByTestId("counts")).toHaveTextContent("{}");
    expect(threads).not.toHaveBeenCalled();
  });

  it("counts the pending applications, for the platform", () => {
    adminProviders.mockReturnValue({ data: [{ id: "a" }, { id: "b" }, { id: "c" }] });
    render(<ConsoleCountsProvider zone="platform"><Probe /></ConsoleCountsProvider>);
    expect(screen.getByTestId("counts")).toHaveTextContent('{"pendingProviders":3}');
    expect(adminProviders).toHaveBeenCalledWith({ status: "pending" });
  });

  it("reports nothing for the platform while the list is loading", () => {
    adminProviders.mockReturnValue({ data: undefined });
    render(<ConsoleCountsProvider zone="platform"><Probe /></ConsoleCountsProvider>);
    expect(screen.getByTestId("counts")).toHaveTextContent("{}");
  });
});
