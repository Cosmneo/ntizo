import { afterEach, describe, expect, it, vi } from "vitest";
import { startThread } from "../use-start-thread";
import * as client from "@/shared/lib/graphql/session-graphql";

afterEach(() => vi.restoreAllMocks());

describe("startThread", () => {
  it("calls the flattened field `communicationStartThread`, never nested `communication { startThread }`", async () => {
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ communicationStartThread: { id: "t9" } } as never);

    const id = await startThread("p1");

    const [query, variables] = spy.mock.calls[0]!;
    expect(query as string).toContain("communicationStartThread");
    expect(query as string).not.toContain("communication {");
    expect(query as string).not.toMatch(/communication\s*\{\s*startThread/);
    expect(variables).toEqual({ input: { providerId: "p1" } });
    expect(id).toBe("t9");
  });

  it("resolves to the same thread id on a second call for the same provider — the server-side idempotency this hook relies on", async () => {
    // Not a test of the server's upsert (that's the backend's own test
    // suite's job) — this pins down that the frontend does not add its own
    // opinion about "already started" and simply returns whatever id the
    // mutation resolved with, twice, from two independent calls.
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ communicationStartThread: { id: "t9" } } as never);

    const first = await startThread("p1");
    const second = await startThread("p1");

    expect(first).toBe("t9");
    expect(second).toBe("t9");
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
