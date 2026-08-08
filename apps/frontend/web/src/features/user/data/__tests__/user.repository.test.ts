import { afterEach, describe, expect, it, vi } from "vitest";
import { userQueries } from "../user.repository";
import * as client from "@/shared/lib/graphql/session-graphql";

afterEach(() => vi.restoreAllMocks());

describe("userQueries.me", () => {
  it("exposes a stable query key and unwraps the flattened field", async () => {
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ userMe: { id: "u1", email: "a@b.c" } } as never);

    const opts = userQueries.me();
    expect(opts.queryKey).toEqual(["user", "me"]);

    const result = await (opts.queryFn as () => Promise<unknown>)();
    expect(result).toEqual({ id: "u1", email: "a@b.c" });
    // Sends `input: {}` — the field's argument is required even though empty.
    expect(spy.mock.calls[0]![1]).toEqual({ input: {} });
  });
});
