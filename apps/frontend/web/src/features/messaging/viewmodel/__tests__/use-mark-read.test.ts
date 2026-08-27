import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { markThreadRead, useMarkRead } from "../use-mark-read";
import * as client from "@/shared/lib/graphql/session-graphql";

afterEach(() => vi.restoreAllMocks());

/** `useMarkRead` needs a live `QueryClient` in the tree to call `useMutation`. */
function withQueryClient(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

describe("markThreadRead", () => {
  it("calls the flattened field `communicationMarkRead`, never nested `communication { markRead }`", async () => {
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ communicationMarkRead: { marked: 3 } } as never);

    const marked = await markThreadRead("t1");

    const [query, variables] = spy.mock.calls[0]!;
    expect(query as string).toContain("communicationMarkRead");
    expect(query as string).not.toContain("communication {");
    expect(query as string).not.toMatch(/communication\s*\{\s*markRead/);
    expect(variables).toEqual({ input: { threadId: "t1" } });
    expect(marked).toBe(3);
  });

  it("passes the given threadId through untouched, never a different one", async () => {
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ communicationMarkRead: { marked: 0 } } as never);

    await markThreadRead("t-other");

    const [, variables] = spy.mock.calls[0]!;
    expect(variables).toEqual({ input: { threadId: "t-other" } });
  });
});


describe("useMarkRead", () => {
  it("invalidates the whole [\"messaging\"] query-key prefix on success — the entire reason this hook exists", async () => {
    // A reviewer deleted the `onSuccess` invalidation from `use-mark-read.ts`
    // outright and reran the suite: 20/20 messaging tests still passed,
    // typecheck clean. Without this, an inbox keeps showing unread after the
    // person has plainly read the conversation — the exact failure the spec
    // names. This test renders the real hook against a real `QueryClient`
    // and asserts `invalidateQueries` was actually called, not just that the
    // mutation resolved.
    vi.spyOn(client, "sessionGraphql").mockResolvedValue({
      communicationMarkRead: { marked: 2 },
    } as never);

    const qc = new QueryClient();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    const { result } = renderHook(() => useMarkRead(), {
      wrapper: withQueryClient(qc),
    });

    act(() => {
      result.current.markRead("t1");
    });

    await waitFor(() => expect(result.current.marking).toBe(false));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["messaging"] });
  });
});
