import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActivityPageDTO } from "@ntizo/shared/read-models";
import { ACTIVITY_PAGE_SIZE, activityQueries } from "../activity.repository";
import * as client from "@/shared/lib/graphql/session-graphql";

afterEach(() => vi.restoreAllMocks());

const twoItemPage: ActivityPageDTO = {
  items: [
    {
      id: "a1",
      type: "service.published",
      payload: { serviceId: "s1", serviceName: "Haircut" },
      occurredAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "a2",
      type: "review.created",
      payload: { providerName: "Studio X", rating: 5 },
      occurredAt: "2026-01-02T00:00:00.000Z",
    },
  ],
  nextCursor: "cursor-2",
};

describe("activityQueries.mine", () => {
  it("calls the flattened field `activityMine`, never nested `activity.mine`", async () => {
    // The one bug this project already lost a round to: the schema builder
    // flattens `{ activity: { mine } }` to `activityMine` on the wire, and a
    // query written as if it were nested (`activity { mine { ... } }`) would
    // fail against the real server even though nothing here would catch it
    // without asserting the query text itself.
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ activityMine: twoItemPage } as never);

    const opts = activityQueries.mine();
    const queryFn = opts.queryFn as (ctx: {
      pageParam: string | undefined;
    }) => Promise<ActivityPageDTO>;
    const result = await queryFn({ pageParam: undefined });

    const [query] = spy.mock.calls[0]!;
    expect(query as string).toContain("activityMine");
    expect(query as string).not.toContain("activity.mine");
    expect(query as string).not.toMatch(/activity\s*\{\s*mine/);

    // Two rows with distinct `occurredAt`, asserted in order: a fixture
    // with a single item would pass even if the unwrap silently dropped or
    // reordered entries. This one would not.
    expect(result).toEqual(twoItemPage);
    expect(result.items.map((i) => i.id)).toEqual(["a1", "a2"]);
  });

  it("sends the page size and no cursor on the first page", async () => {
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ activityMine: { items: [], nextCursor: null } } as never);

    const opts = activityQueries.mine();
    const queryFn = opts.queryFn as (ctx: {
      pageParam: string | undefined;
    }) => Promise<ActivityPageDTO>;
    await queryFn({ pageParam: undefined });

    const [, variables] = spy.mock.calls[0]!;
    expect(variables).toEqual({
      input: { limit: ACTIVITY_PAGE_SIZE, cursor: undefined },
    });
  });

  it("passes a later cursor through untouched, not reset to the first page", async () => {
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ activityMine: { items: [], nextCursor: null } } as never);

    const opts = activityQueries.mine();
    const queryFn = opts.queryFn as (ctx: {
      pageParam: string | undefined;
    }) => Promise<ActivityPageDTO>;
    await queryFn({ pageParam: "cursor-2" });

    const [, variables] = spy.mock.calls[0]!;
    expect(variables).toEqual({
      input: { limit: ACTIVITY_PAGE_SIZE, cursor: "cursor-2" },
    });
  });

  it("stays inside the server's 1..50 window — over 50 is VALIDATION_ERROR, not a clamp", () => {
    expect(ACTIVITY_PAGE_SIZE).toBeGreaterThanOrEqual(1);
    expect(ACTIVITY_PAGE_SIZE).toBeLessThanOrEqual(50);
  });

  it("maps a real cursor to the next page param", () => {
    const opts = activityQueries.mine();
    const getNextPageParam = opts.getNextPageParam as (
      last: ActivityPageDTO,
    ) => string | undefined;
    expect(getNextPageParam({ items: [], nextCursor: "cursor-3" })).toBe(
      "cursor-3",
    );
  });

  it("maps a null nextCursor to undefined, since hasNextPage reads undefined as \"no more\"", () => {
    // If this instead returned `null`, TanStack Query's `hasNextPage` would
    // still read it as falsy today, but `fetchNextPage` would be called
    // with `pageParam: null` rather than never being called at all — the
    // distinct-from-a-real-cursor case this test pins down.
    const opts = activityQueries.mine();
    const getNextPageParam = opts.getNextPageParam as (
      last: ActivityPageDTO,
    ) => string | undefined;
    expect(getNextPageParam({ items: [], nextCursor: null })).toBeUndefined();
  });
});
