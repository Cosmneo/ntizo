import { describe, expect, it } from "bun:test";
import { Favourite } from "../domain/aggregates/favourite.aggregate";
import { FavouriteList } from "../domain/aggregates/favourite-list.aggregate";
import { UnknownFavouriteTargetError } from "../domain/exceptions";

describe("FavouriteList", () => {
  it("makes the default list nameless", () => {
    // Null is the mechanism, not an oversight: the name is rendered from a
    // translated key so the same list reads Favoritos or Favourites.
    const l = FavouriteList.createDefault({ userId: "u1", createdAt: new Date(0) });
    expect(l.name).toBeNull();
    expect(l.isDefault).toBe(true);
  });

  it("refuses a blank name on a list somebody named", () => {
    // A list called "   " is a row nobody can identify in the dialog.
    expect(() => FavouriteList.create({ userId: "u1", name: "   ", createdAt: new Date(0) })).toThrow();
  });

  it("trims the name, so two lists do not differ by a trailing space", () => {
    expect(FavouriteList.create({ userId: "u1", name: "  Casa nova ", createdAt: new Date(0) }).name).toBe("Casa nova");
  });

  it("refuses a name longer than the column", () => {
    // 61 characters is a silent truncation at the database or an error the
    // person reads as "saving is broken". Refused here, where the message can
    // say what the limit is.
    expect(() => FavouriteList.create({ userId: "u1", name: "x".repeat(61), createdAt: new Date(0) })).toThrow();
  });

  it("lets the default list be renamed, and it stops being nameless", () => {
    // Renaming it is allowed — a list somebody named is theirs. Deleting it
    // is not; that rule lives in RemoveListCommand, where the repository is.
    const l = FavouriteList.createDefault({ userId: "u1", createdAt: new Date(0) }).rename("A minha lista");
    expect(l.name).toBe("A minha lista");
    expect(l.isDefault).toBe(true);
  });

  it("rehydrates without re-validating", () => {
    // Validation belongs on the way in. Routing reads through `create` means a
    // rule tightened later throws on *read* — and because the repository maps
    // a whole page in one pass, one such row would fail the entire page
    // instead of only itself. The same split `Activity.rehydrate` makes.
    expect(() =>
      FavouriteList.rehydrate({ id: "l1", userId: "u1", name: "x".repeat(200), isDefault: false, createdAt: new Date(0) }),
    ).not.toThrow();
  });
});

describe("Favourite", () => {
  it("refuses a target kind nothing can render", () => {
    // A row with targetType 'booking' is unreadable by every projection and
    // would sit in a list forever as a gap.
    expect(() =>
      Favourite.file({ listId: "l1", userId: "u1", targetType: "booking" as never, targetId: "t1", createdAt: new Date(0) }),
    ).toThrow(UnknownFavouriteTargetError);
  });

  it("refuses a blank owner, list or target", () => {
    for (const over of [{ userId: "  " }, { listId: "  " }, { targetId: "  " }]) {
      expect(() =>
        Favourite.file({ listId: "l1", userId: "u1", targetType: "service", targetId: "t1", createdAt: new Date(0), ...over }),
      ).toThrow();
    }
  });

  it("keeps what it was given", () => {
    const f = Favourite.file({ listId: "l1", userId: "u1", targetType: "provider", targetId: "p1", createdAt: new Date(5) });
    expect({ listId: f.listId, targetType: f.targetType, targetId: f.targetId }).toEqual({
      listId: "l1",
      targetType: "provider",
      targetId: "p1",
    });
  });
});
