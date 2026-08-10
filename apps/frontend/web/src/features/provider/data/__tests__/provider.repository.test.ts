import { afterEach, describe, expect, it, vi } from "vitest";
import { providerQueries, inviteMember } from "../provider.repository";
import * as client from "@/shared/lib/graphql/session-graphql";

afterEach(() => vi.restoreAllMocks());

describe("providerQueries.mine", () => {
  it("exposes a stable query key and unwraps the flattened field", async () => {
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({
        providerMine: [{ id: "p1", name: "Org" }],
      } as never);

    const opts = providerQueries.mine();
    expect(opts.queryKey).toEqual(["providers", "mine"]);

    const result = await (opts.queryFn as () => Promise<unknown>)();
    expect(result).toEqual([{ id: "p1", name: "Org" }]);
    // Sends `input: {}` — the field's argument is required even though empty.
    expect(spy.mock.calls[0]![1]).toEqual({ input: {} });
  });
});

describe("mutations", () => {
  it("returns only the declared output of an invite", async () => {
    vi.spyOn(client, "sessionGraphql").mockResolvedValue({
      providerInvitesSend: { inviteId: "i1" },
    } as never);
    const out = await inviteMember("p1", { email: "a@b.c", role: "staff" });
    expect(out).toEqual({ inviteId: "i1" });
    // The backend strips it, but assert the client never surfaces a token either.
    expect("token" in (out as object)).toBe(false);
  });
});
