import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useOpenSupportRequest } from "../use-open-support-request";
import { GraphqlError } from "@/shared/lib/graphql/session-graphql";

const fakes = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock("@/features/help-center/data/support.repository", () => ({ openSupportRequest: fakes.open }));

function wrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe("useOpenSupportRequest", () => {
  it("returns the new thread id and invalidates the messaging lists", async () => {
    fakes.open.mockResolvedValue("t-1");
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useOpenSupportRequest(), { wrapper: wrapper(qc) });

    let id: string | null = null;
    await act(async () => {
      id = await result.current.openRequest({ audience: "customer", subject: "S", body: "B" });
    });

    expect(id).toBe("t-1");
    expect(spy).toHaveBeenCalledWith({ queryKey: ["messaging"] });
  });

  it("resolves null and reports the code when the server refuses", async () => {
    // `messagingErrorCode` only reads `GraphqlError` instances (see that
    // function's own doc comment): it prefers `extensions.originalCode`
    // over the coarse `extensions.code`, and returns `undefined` for
    // anything that is not `instanceof GraphqlError`. A bare
    // `Error`-with-a-`.code`-property, as a naive fixture might use, would
    // make `errorCode` come back `undefined` here, not the domain code —
    // so the rejection is shaped exactly like the wire response
    // `GraphqlError`'s constructor parses.
    fakes.open.mockRejectedValue(
      new GraphqlError(422, [
        { message: "Too many open requests", extensions: { code: "UNPROCESSABLE", originalCode: "SUPPORT_TOO_MANY_OPEN" } },
      ]),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const { result } = renderHook(() => useOpenSupportRequest(), { wrapper: wrapper(qc) });

    let id: string | null = "unset";
    await act(async () => {
      id = await result.current.openRequest({ audience: "customer", subject: "S", body: "B" });
    });

    expect(id).toBeNull();
    await waitFor(() => expect(result.current.errorCode).toBe("SUPPORT_TOO_MANY_OPEN"));
  });
});
