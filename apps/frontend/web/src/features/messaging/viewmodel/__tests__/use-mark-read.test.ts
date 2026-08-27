import { afterEach, describe, expect, it, vi } from "vitest";
import { markThreadRead } from "../use-mark-read";
import * as client from "@/shared/lib/graphql/session-graphql";

afterEach(() => vi.restoreAllMocks());

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
