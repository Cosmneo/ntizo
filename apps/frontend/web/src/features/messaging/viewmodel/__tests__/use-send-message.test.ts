import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { sendMessage, useSendMessage } from "../use-send-message";
import * as client from "@/shared/lib/graphql/session-graphql";

afterEach(() => vi.restoreAllMocks());

/** `useSendMessage` needs a live `QueryClient` in the tree to call `useMutation`. */
function withQueryClient(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

describe("sendMessage", () => {
  it("calls the flattened field `communicationSend`, never nested `communication { send }`", async () => {
    // This field went a whole review round with no wire-string test at
    // all: a rewrite that nested it as `communication { send(input: $input) { id } }`
    // passed `vitest` and `tsc --noEmit` clean, since nothing asserted the
    // query text itself — the exact regression `activity` and
    // `notifications` have each already lost a round to.
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ communicationSend: { id: "m9" } } as never);

    const id = await sendMessage("t1", "Olá, tudo bem?");

    const [query, variables] = spy.mock.calls[0]!;
    expect(query as string).toContain("communicationSend");
    expect(query as string).not.toContain("communication {");
    expect(query as string).not.toMatch(/communication\s*\{\s*send/);
    expect(variables).toEqual({ input: { threadId: "t1", body: "Olá, tudo bem?" } });
    expect(id).toBe("m9");
  });

  it("passes the given threadId and body through untouched", async () => {
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ communicationSend: { id: "m10" } } as never);

    await sendMessage("t-other", "Confirmado para amanhã");

    const [, variables] = spy.mock.calls[0]!;
    expect(variables).toEqual({
      input: { threadId: "t-other", body: "Confirmado para amanhã" },
    });
  });
});


describe("useSendMessage", () => {
  it('invalidates the whole ["messaging"] query-key prefix on success — the thread just sent into, and every inbox row its lastMessageAt/lastMessagePreview just changed', async () => {
    // Same class of gap `use-mark-read.ts` had: the mutation resolving is
    // not proof the cache was told to refresh. Rendered against a real
    // QueryClient so `invalidateQueries` is asserted as an actual call, not
    // inferred from the mutation settling.
    vi.spyOn(client, "sessionGraphql").mockResolvedValue({
      communicationSend: { id: "m1" },
    } as never);

    const qc = new QueryClient();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: withQueryClient(qc),
    });

    act(() => {
      result.current.send("t1", "Olá, tudo bem?");
    });

    await waitFor(() => expect(result.current.sending).toBe(false));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["messaging"] });
  });
});
