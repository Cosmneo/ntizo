import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { currentUserReadModel } from "@ntizo/shared";
import { userQueries } from "../user.repository";
import * as client from "@/shared/lib/graphql/session-graphql";
import { GraphqlError } from "@/shared/lib/graphql/session-graphql";

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

  it("selects every field of the current-user read model", async () => {
    // Guards against a selection that drops a field silently: the document
    // is an untyped template string and sessionGraphql's generic is a cast,
    // so nothing else in the type system would catch it. A field like
    // `role` going missing wouldn't fail the build — it would just make
    // `canAccessAdmin` read `undefined !== "admin"` for every user.
    vi.spyOn(client, "sessionGraphql").mockResolvedValue({ userMe: {} } as never);
    await (userQueries.me().queryFn as () => Promise<unknown>)();
    const [document] = (client.sessionGraphql as ReturnType<typeof vi.spyOn>).mock
      .calls[0] as [string, unknown];

    for (const key of Object.keys(currentUserReadModel.shape)) {
      // Word-boundary match, not a plain substring check: field names are
      // camelCase tokens, and a naive `.includes` could pass by accident on
      // a shared substring.
      expect(document).toMatch(new RegExp(`\\b${key}\\b`));
    }
  });

  it("resolves to null on a genuine sign-out, in the real query cache — never the prior session's data", async () => {
    // TanStack Query v5 keeps `data` at its last *successful* value when a
    // refetch's queryFn throws (status flips to "error", data is
    // untouched). Exercised against the real QueryClient, not just the bare
    // queryFn, because that cache-retention behavior is what actually bites:
    // a session expiring mid-tab would otherwise leave zone-switcher.tsx and
    // both sidebar-user-menu.tsx rendering the signed-out user indefinitely.
    const spy = vi.spyOn(client, "sessionGraphql");
    spy.mockResolvedValueOnce({
      userMe: { id: "u1", email: "old@user.example" },
    } as never);

    const qc = new QueryClient();
    const opts = userQueries.me();

    await qc.fetchQuery(opts);
    expect(qc.getQueryData(opts.queryKey)).toEqual({
      id: "u1",
      email: "old@user.example",
    });

    // The session expires; the transport now rejects with the backend's
    // typed auth failure — `requireRequesterUserId` throws the kit's
    // `UnauthorizedError`, which `getGraphQLErrorCode` maps to the coarse
    // `UNAUTHENTICATED` extension code (see
    // packages/backend/src/modules/ntizo/graphql/context.ts). staleTime
    // defaults to 0, so this fetchQuery call issues a real refetch rather
    // than serving the cached value.
    spy.mockRejectedValueOnce(
      new GraphqlError(200, [
        {
          message: "Authentication required",
          extensions: { code: "UNAUTHENTICATED", originalCode: "UNAUTHENTICATED" },
        },
      ]),
    );
    await qc.fetchQuery(opts);

    expect(qc.getQueryData(opts.queryKey)).toBeNull();
  });

  it("propagates a non-auth failure instead of masquerading it as signed-out", async () => {
    // The regression this guards against: before this fix, `queryFn` caught
    // *every* rejection indiscriminately and resolved `null`, so a database
    // blip during an admin's navigation to /admin looked identical to
    // "not signed in" — `canAccessAdmin(null)` read false and the admin was
    // silently redirected to `/` with no error surfaced anywhere. A
    // non-auth failure (any `kitCode` other than `UNAUTHENTICATED`, or a
    // non-GraphqlError transport failure) must now reject instead.
    const qc = new QueryClient();
    const opts = userQueries.me();

    vi.spyOn(client, "sessionGraphql").mockRejectedValueOnce(
      new GraphqlError(500, [
        { message: "Database unavailable", extensions: { code: "INTERNAL_ERROR" } },
      ]),
    );

    await expect(qc.fetchQuery(opts)).rejects.toBeInstanceOf(GraphqlError);
  });

  it("propagates a raw transport failure (not even a GraphqlError) rather than swallowing it", async () => {
    const qc = new QueryClient();
    const opts = userQueries.me();

    vi.spyOn(client, "sessionGraphql").mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(qc.fetchQuery(opts)).rejects.toThrow("Failed to fetch");
  });
});
