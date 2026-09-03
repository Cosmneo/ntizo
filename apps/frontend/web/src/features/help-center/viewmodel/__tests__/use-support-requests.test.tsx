import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useSupportRequests } from "../use-support-requests";

const fakes = vi.hoisted(() => ({ graphql: vi.fn() }));
vi.mock("@/shared/lib/graphql/session-graphql", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/shared/lib/graphql/session-graphql")>();
  return { ...actual, sessionGraphql: fakes.graphql };
});

function wrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

/**
 * The `enabled` gate, pinned rather than assumed.
 *
 * This hook's third argument is the whole of what closed follow-up #151:
 * `HelpCenter` is mounted at the root of every page, so before the gate
 * existed an authenticated inbox query ran for every visitor on every
 * route — twice per anonymous landing-page view, both answered
 * `UNAUTHENTICATED`, and again on `/admin` and inside checkout where the
 * panel cannot be opened at all.
 *
 * That follow-up was closed on the gate's behaviour, and nothing was
 * proving the behaviour: `use-support-requests.ts` had no test file, and
 * `help-center.test.tsx` mocks this hook wholesale, so deleting the
 * argument at the call site turned nothing red. These three cases are that
 * proof. They assert on `sessionGraphql` — the transport itself — rather
 * than on a repository fake, because the claim being made is specifically
 * that no request reaches the network.
 */
describe("useSupportRequests", () => {
  beforeEach(() => {
    fakes.graphql.mockReset();
    fakes.graphql.mockResolvedValue({
      communicationMyThreads: { items: [], nextCursor: null },
      communicationProviderThreads: { items: [], nextCursor: null },
    });
  });

  it("asks for nothing when the caller's gate is closed", async () => {
    const { result } = renderHook(() => useSupportRequests("customer", null, false), {
      wrapper: wrapper(client()),
    });

    // Settled, not merely un-awaited: a disabled query reports `isPending`
    // true forever (it has no data and never will), so waiting on the hook's
    // own `loading` flag would hang. The transport is the honest witness.
    await waitFor(() => expect(result.current.requests).toEqual([]));
    expect(fakes.graphql).not.toHaveBeenCalled();
  });

  it("asks once when the gate is open", async () => {
    renderHook(() => useSupportRequests("customer", null, true), {
      wrapper: wrapper(client()),
    });

    await waitFor(() => expect(fakes.graphql).toHaveBeenCalledTimes(1));
  });

  it("still asks for nothing on a provider audience whose workspace has not resolved", async () => {
    // Two gates stack here, and this pins the inner one: even with the
    // caller's gate open, `forProvider`'s own empty-id guard must keep the
    // query off, or the panel would ask the server for the threads of a
    // provider called "".
    renderHook(() => useSupportRequests("provider", null, true), {
      wrapper: wrapper(client()),
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fakes.graphql).not.toHaveBeenCalled();
  });
});
