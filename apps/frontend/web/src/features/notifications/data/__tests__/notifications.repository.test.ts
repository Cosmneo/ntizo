import { afterEach, describe, expect, it, vi } from "vitest";
import type { InboxPageDTO } from "@ntizo/shared/read-models";
import { INBOX_PAGE_SIZE, notificationQueries } from "../notifications.repository";
import * as client from "@/shared/lib/graphql/session-graphql";

afterEach(() => vi.restoreAllMocks());

function page(count: number, total: number): InboxPageDTO {
  return {
    total,
    items: Array.from({ length: count }, (_, i) => ({
      id: `n${i}`,
      type: "PROVIDER_VERIFIED",
      payload: {},
      createdAt: "2026-01-01T00:00:00.000Z",
      read: false,
    })),
  };
}

/**
 * `getNextPageParam`, called the way TanStack Query calls it.
 *
 * Its fourth argument is the list of page params fetched so far; the inbox's
 * own implementation reads neither it nor the third, but the signature takes
 * both and a test that guessed at a shorter one would be testing a function
 * the library never calls.
 */
function nextOffset(
  options: ReturnType<typeof notificationQueries.mine>,
  pages: InboxPageDTO[],
) {
  const params = pages.map((_, i) => i * INBOX_PAGE_SIZE);
  return options.getNextPageParam(
    pages[pages.length - 1]!,
    pages,
    params[params.length - 1]!,
    params,
  );
}

describe("notificationQueries.mine", () => {
  it("asks for the first page at offset zero", async () => {
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ notificationMine: page(0, 0) } as never);

    const options = notificationQueries.mine();
    const queryFn = options.queryFn as (ctx: { pageParam: number }) => Promise<InboxPageDTO>;
    await queryFn({ pageParam: 0 });

    const [query, variables] = spy.mock.calls[0]!;
    // The flattened field name, not `notification { mine }` — the schema
    // builder joins the path, and this project has already lost a round to
    // writing the nested form (see this repository's own doc comment).
    expect(query as string).toContain("notificationMine");
    expect(variables).toEqual({ input: { limit: INBOX_PAGE_SIZE, offset: 0 } });
  });

  it("carries the page param through as the offset", async () => {
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ notificationMine: page(0, 0) } as never);

    const options = notificationQueries.mine();
    const queryFn = options.queryFn as (ctx: { pageParam: number }) => Promise<InboxPageDTO>;
    await queryFn({ pageParam: 40 });

    const [, variables] = spy.mock.calls[0]!;
    expect(variables).toEqual({ input: { limit: INBOX_PAGE_SIZE, offset: 40 } });
  });

  it("points the next page at the rows already loaded", () => {
    expect(nextOffset(notificationQueries.mine(), [page(20, 25)])).toBe(20);
  });

  it("stops once the loaded rows reach the total", () => {
    // 20 + 5 = 25 of 25. `undefined` is what `hasNextPage` reads as "no more";
    // any other value keeps the door open.
    expect(nextOffset(notificationQueries.mine(), [page(20, 25), page(5, 25)])).toBeUndefined();
  });

  it("counts what actually arrived rather than assuming full pages", () => {
    // A short first page — the reader marked things read between two fetches,
    // rows moved, the server clamped the limit. `pages.length * 20` would ask
    // for offset 20 here and skip rows 18 and 19 for good.
    expect(nextOffset(notificationQueries.mine(), [page(18, 40)])).toBe(18);
  });

  it("stops on an empty page even when the total disagrees", () => {
    // The infinite-loop guard, and the reason it is not merely tidy: the end
    // of this list is watched by an `IntersectionObserver`. A `total` the
    // server cannot satisfy — rows deleted between two requests is enough —
    // would otherwise leave offset 20 requested again on every scroll, each
    // one coming back empty and each one leaving `hasNextPage` true.
    expect(nextOffset(notificationQueries.mine(), [page(20, 99), page(0, 99)])).toBeUndefined();
  });
});

describe("notificationQueries.forProvider", () => {
  it("sends the workspace id alongside the offset", async () => {
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ notificationForProvider: page(0, 0) } as never);

    const options = notificationQueries.forProvider("prov-1");
    const queryFn = options.queryFn as (ctx: { pageParam: number }) => Promise<InboxPageDTO>;
    await queryFn({ pageParam: 20 });

    const [query, variables] = spy.mock.calls[0]!;
    expect(query as string).toContain("notificationForProvider");
    expect(variables).toEqual({
      input: { providerId: "prov-1", limit: INBOX_PAGE_SIZE, offset: 20 },
    });
  });

  it("is disabled for an empty provider id, the same guard walletQueries needs", () => {
    // The provider shell renders before its workspace resolves, and a query
    // fired with `providerId: ""` fails the backend's `z.string().min(1)`.
    expect(notificationQueries.forProvider("").enabled).toBe(false);
    expect(notificationQueries.forProvider("prov-1").enabled).toBe(true);
  });
});
