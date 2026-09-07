import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { useMarkRead } from "@/features/notifications/viewmodel/use-mark-read";

// The network is the seam: what this hook owns is which mutation it sends
// and what it tells the reader when that is refused, and both are observable
// through a fake wire and a fake toast.
const fakes = vi.hoisted(() => ({ graphql: vi.fn() }));

vi.mock("@/shared/lib/graphql/session-graphql", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/graphql/session-graphql")>()),
  sessionGraphql: fakes.graphql,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  fakes.graphql.mockReset();
  vi.mocked(toast.error).mockReset();
});

describe("useMarkRead", () => {
  it("says so when a mark-all is refused, instead of a click that did nothing", async () => {
    fakes.graphql.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useMarkRead({ kind: "mine" }), { wrapper });

    act(() => result.current.markAll());

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Could not mark as read. Try again."),
    );
  });

  it("says so when a single mark is refused — a toast, since the row may already have navigated away", async () => {
    fakes.graphql.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useMarkRead({ kind: "mine" }), { wrapper });

    act(() => result.current.markOne("n1"));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Could not mark as read. Try again."),
    );
  });

  it("says nothing when a mark goes through", async () => {
    fakes.graphql.mockResolvedValueOnce({ notificationMarkAllRead: { marked: 3 } });
    const { result } = renderHook(() => useMarkRead({ kind: "mine" }), { wrapper });

    act(() => result.current.markAll());

    await waitFor(() => expect(fakes.graphql).toHaveBeenCalledTimes(1));
    expect(toast.error).not.toHaveBeenCalled();
  });
});
