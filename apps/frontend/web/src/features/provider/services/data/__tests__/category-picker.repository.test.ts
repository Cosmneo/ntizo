import { afterEach, describe, expect, it, vi } from "vitest";
import { categoryPickerQueries } from "../category-picker.repository";
import * as client from "@/shared/lib/graphql/public-graphql";

afterEach(() => vi.restoreAllMocks());

describe("categoryPickerQueries.all", () => {
  it("returns everything on one page when there is only one", async () => {
    vi.spyOn(client, "publicGraphql").mockResolvedValue({
      categoryAll: { items: [{ id: "c1", code: "hair", name: "Hair" }], nextOffset: null },
    } as never);

    const items = await (categoryPickerQueries.all("en-US").queryFn as () => Promise<unknown>)();
    expect(items).toEqual([{ id: "c1", code: "hair", name: "Hair" }]);
  });

  it("follows nextOffset until the server reports no more, rather than stopping at the first page", async () => {
    // The picker's job is to offer every category a `Select`'s own
    // client-side search can filter — a category past a silently-dropped
    // first page would be one nobody could ever choose.
    const spy = vi.spyOn(client, "publicGraphql");
    spy.mockResolvedValueOnce({
      categoryAll: { items: [{ id: "c1", code: "hair", name: "Hair" }], nextOffset: 48 },
    } as never);
    spy.mockResolvedValueOnce({
      categoryAll: { items: [{ id: "c2", code: "plumbing", name: "Plumbing" }], nextOffset: null },
    } as never);

    const items = await (categoryPickerQueries.all("en-US").queryFn as () => Promise<unknown>)();
    expect(items).toEqual([
      { id: "c1", code: "hair", name: "Hair" },
      { id: "c2", code: "plumbing", name: "Plumbing" },
    ]);
    expect(spy).toHaveBeenCalledTimes(2);
    // The second request picks up exactly where the first left off.
    expect(spy.mock.calls[1]![1]).toMatchObject({ input: { locale: "en-US", limit: 48, offset: 48 } });
  });
});
