import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FAVOURITE_MARKS_KEY_IDS_INDEX,
  createFavouriteList,
  favouriteQueries,
  fetchFavouriteListsFor,
  fetchFavouriteMarks,
  fetchMyLists,
  quickSaveFavourite,
  setFavouriteLists,
} from "../favourites.repository";
import * as client from "@/shared/lib/graphql/session-graphql";

afterEach(() => vi.restoreAllMocks());

/**
 * The wire strings, asserted against the field names a running server
 * reported in Task 8 — not against what the backend's source looks like it
 * ought to emit.
 *
 * `activity` and `messaging` each lost a whole review round to a nested
 * `context { field }` document that typechecked, passed every other test, and
 * resolved to nothing at runtime. These are the tests that would catch it:
 * the plain network functions are exported separately from the hooks
 * precisely so the query text can be read back off the spy.
 */
describe("fetchFavouriteMarks", () => {
  it("calls the flattened field `favouriteMarked`, never nested `favourite { marked }`", async () => {
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ favouriteMarked: ["s1"] } as never);

    const marked = await fetchFavouriteMarks("service", ["s1", "s2"]);

    const [query, variables] = spy.mock.calls[0]!;
    expect(query as string).toContain("favouriteMarked");
    expect(query as string).not.toMatch(/favourite\s*\{\s*marked/);
    expect(query as string).toContain("$input: FavouriteMarkedInput!");
    expect(variables).toEqual({
      input: { targetType: "service", targetIds: ["s1", "s2"] },
    });
    expect(marked).toEqual(["s1"]);
  });

  it("asks for no selection set — the field answers a list of ids, not objects", async () => {
    // `markMyFavourites`' output is `z.array(z.string())`, so the field is a
    // leaf on the wire. A `{ id }` under it is not a silent no-op: the server
    // refuses the whole document as invalid.
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ favouriteMarked: [] } as never);

    await fetchFavouriteMarks("provider", ["p1"]);

    const [query] = spy.mock.calls[0]!;
    expect(query as string).not.toMatch(/favouriteMarked\(input: \$input\)\s*\{/);
  });

  it("passes the target type through untouched", async () => {
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ favouriteMarked: [] } as never);

    await fetchFavouriteMarks("provider", ["p9"]);

    const [, variables] = spy.mock.calls[0]!;
    expect(variables).toEqual({ input: { targetType: "provider", targetIds: ["p9"] } });
  });
});

describe("fetchFavouriteListsFor", () => {
  it("calls the flattened field `favouriteListsFor`, never nested `favourite { listsFor }`", async () => {
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ favouriteListsFor: ["l-casa"] } as never);

    const held = await fetchFavouriteListsFor("service", "s1");

    const [query, variables] = spy.mock.calls[0]!;
    expect(query as string).toContain("favouriteListsFor");
    expect(query as string).not.toMatch(/favourite\s*\{\s*listsFor/);
    expect(query as string).toContain("$input: FavouriteListsForInput!");
    expect(variables).toEqual({ input: { targetType: "service", targetId: "s1" } });
    expect(held).toEqual(["l-casa"]);
  });

  it("asks for no selection set — the field answers a list of ids, not objects", async () => {
    // `listsForTarget`'s output is `z.array(z.string())`, so the field is a
    // leaf on the wire. A `{ id }` under it is not a silent no-op: the server
    // refuses the whole document as invalid.
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ favouriteListsFor: [] } as never);

    await fetchFavouriteListsFor("provider", "p1");

    const [query] = spy.mock.calls[0]!;
    expect(query as string).not.toMatch(/favouriteListsFor\(input: \$input\)\s*\{/);
  });
});

describe("fetchMyLists", () => {
  it("sends the generic `JSON!` input, because `FavouriteListMineInput` does not exist", async () => {
    // The one field of the nine that does not get its own named input type:
    // its input carries nothing but identity, which the server reads off the
    // session. Task 8's introspection listed every `Favourite*` type the
    // schema has and there is no `FavouriteListMineInput` among them — a
    // document declaring one is refused before it reaches a resolver. Same
    // shape `providerMine` and `userMe` already use.
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ favouriteListMine: [] } as never);

    await fetchMyLists();

    const [query, variables] = spy.mock.calls[0]!;
    expect(query as string).toContain("favouriteListMine");
    expect(query as string).toContain("$input: JSON!");
    expect(query as string).not.toContain("FavouriteListMineInput");
    expect(query as string).not.toMatch(/favouriteList\s*\{\s*mine/);
    expect(variables).toEqual({ input: {} });
  });

  it("selects every field a list row draws itself from", async () => {
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ favouriteListMine: [] } as never);

    await fetchMyLists();

    const [query] = spy.mock.calls[0]!;
    for (const field of ["id", "name", "isDefault", "itemCount", "coverUrls"]) {
      expect(query as string).toContain(field);
    }
  });
});

describe("quickSaveFavourite", () => {
  it("calls the flattened field `favouriteQuickSave` and returns the lists it landed in", async () => {
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ favouriteQuickSave: { listIds: ["l1"] } } as never);

    const listIds = await quickSaveFavourite("service", "s1");

    const [query, variables] = spy.mock.calls[0]!;
    expect(query as string).toContain("favouriteQuickSave");
    expect(query as string).toContain("$input: FavouriteQuickSaveInput!");
    expect(query as string).not.toMatch(/favourite\s*\{\s*quickSave/);
    expect(variables).toEqual({ input: { targetType: "service", targetId: "s1" } });
    expect(listIds).toEqual(["l1"]);
  });
});

describe("setFavouriteLists", () => {
  it("calls the flattened field `favouriteSetLists`", async () => {
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ favouriteSetLists: { listIds: ["l2"] } } as never);

    const listIds = await setFavouriteLists("provider", "p1", ["l2"]);

    const [query, variables] = spy.mock.calls[0]!;
    expect(query as string).toContain("favouriteSetLists");
    expect(query as string).toContain("$input: FavouriteSetListsInput!");
    expect(query as string).not.toMatch(/favourite\s*\{\s*setLists/);
    expect(variables).toEqual({
      input: { targetType: "provider", targetId: "p1", listIds: ["l2"] },
    });
    expect(listIds).toEqual(["l2"]);
  });

  it("sends an empty `listIds` as an empty array rather than dropping the field", async () => {
    // An empty array is the meaningful value here — it is how somebody
    // unsaves a listing. Omitting the field would be a different request.
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ favouriteSetLists: { listIds: [] } } as never);

    await setFavouriteLists("service", "s1", []);

    const [, variables] = spy.mock.calls[0]!;
    expect(variables).toEqual({
      input: { targetType: "service", targetId: "s1", listIds: [] },
    });
  });
});

describe("createFavouriteList", () => {
  it("calls the flattened field `favouriteListCreate` and returns the new id", async () => {
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ favouriteListCreate: { id: "l9" } } as never);

    const id = await createFavouriteList("Casa nova");

    const [query, variables] = spy.mock.calls[0]!;
    expect(query as string).toContain("favouriteListCreate");
    expect(query as string).toContain("$input: FavouriteListCreateInput!");
    expect(query as string).not.toMatch(/favouriteList\s*\{\s*create/);
    expect(variables).toEqual({ input: { name: "Casa nova" } });
    expect(id).toBe("l9");
  });
});

describe("favouriteQueries.marks", () => {
  it("sorts the ids into the query key, so the same page in a different order is one cache entry", () => {
    const ascending = favouriteQueries.marks("service", ["s1", "s2", "s3"]).queryKey;
    const descending = favouriteQueries.marks("service", ["s3", "s2", "s1"]).queryKey;

    expect(ascending).toEqual(descending);
    expect(ascending).toEqual(["favourites", "marks", "service", ["s1", "s2", "s3"]]);
  });

  it("keeps two different pages of cards apart", () => {
    expect(favouriteQueries.marks("service", ["s1"]).queryKey).not.toEqual(
      favouriteQueries.marks("service", ["s2"]).queryKey,
    );
  });

  it("keeps the two target types apart", () => {
    expect(favouriteQueries.marks("service", ["x1"]).queryKey).not.toEqual(
      favouriteQueries.marks("provider", ["x1"]).queryKey,
    );
  });

  it("puts the ids where FAVOURITE_MARKS_KEY_IDS_INDEX says they are", () => {
    // `patchMarks` reads that slot back to check a cached page actually asked
    // about the listing it is patching. A key reshaped without moving the
    // constant would leave every optimistic heart waiting for its round trip.
    const key = favouriteQueries.marks("service", ["s2", "s1"]).queryKey;
    expect(key[FAVOURITE_MARKS_KEY_IDS_INDEX]).toEqual(["s1", "s2"]);
  });

  it("does not reorder the caller's own array", () => {
    // The same array is what a listing renders in — sorting it in place would
    // reorder the cards on screen as a side effect of asking about them.
    const ids = ["s3", "s1", "s2"];
    favouriteQueries.marks("service", ids);
    expect(ids).toEqual(["s3", "s1", "s2"]);
  });
});
