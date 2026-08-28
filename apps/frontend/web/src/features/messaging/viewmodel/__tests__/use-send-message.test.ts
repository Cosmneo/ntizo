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
    expect(variables).toEqual({
      input: { threadId: "t1", body: "Olá, tudo bem?", attachments: [] },
    });
    expect(id).toBe("m9");
  });

  it("passes the given threadId and body through untouched, with no attachments given", async () => {
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ communicationSend: { id: "m10" } } as never);

    await sendMessage("t-other", "Confirmado para amanhã");

    const [, variables] = spy.mock.calls[0]!;
    expect(variables).toEqual({
      input: { threadId: "t-other", body: "Confirmado para amanhã", attachments: [] },
    });
  });

  it("sends storageKey and fileName for each attachment, and nothing else", async () => {
    // `contentType`/`sizeBytes` are deliberately absent from
    // `AttachmentDescriptor` — the server reads both back from storage
    // instead (see that type's own doc comment). This is the one test that
    // would catch either sneaking back onto the wire.
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ communicationSend: { id: "m11" } } as never);

    await sendMessage("t1", "", [
      { storageKey: "attachment/u1/1-a", fileName: "foto.jpg" },
    ]);

    const [, variables] = spy.mock.calls[0]!;
    expect(variables).toEqual({
      input: {
        threadId: "t1",
        body: "",
        attachments: [{ storageKey: "attachment/u1/1-a", fileName: "foto.jpg" }],
      },
    });
  });

  it("sends an empty body alongside attachments without refusing it client-side", async () => {
    // The server's own rule: a body-less send is legal exactly when at
    // least one attachment rides with it (`MessageEmptyError`'s doc
    // comment). `sendMessage` is a thin wire call and must not reintroduce
    // a body-required check the server no longer has.
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ communicationSend: { id: "m12" } } as never);

    const id = await sendMessage("t1", "", [
      { storageKey: "attachment/u1/1-a", fileName: "foto.jpg" },
    ]);

    expect(spy).toHaveBeenCalled();
    expect(id).toBe("m12");
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

  it("forwards attachments through to the wire call, defaulting to none", async () => {
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ communicationSend: { id: "m2" } } as never);

    const qc = new QueryClient();
    const { result } = renderHook(() => useSendMessage(), {
      wrapper: withQueryClient(qc),
    });

    act(() => {
      result.current.send("t1", "", [
        { storageKey: "attachment/u1/1-a", fileName: "foto.jpg" },
      ]);
    });

    await waitFor(() => expect(result.current.sending).toBe(false));

    const [, variables] = spy.mock.calls[0]!;
    expect(variables).toEqual({
      input: {
        threadId: "t1",
        body: "",
        attachments: [{ storageKey: "attachment/u1/1-a", fileName: "foto.jpg" }],
      },
    });
  });
});
