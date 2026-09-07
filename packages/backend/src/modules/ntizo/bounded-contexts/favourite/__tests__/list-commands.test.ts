import { beforeEach, describe, expect, it } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { favourite } from "../../../shared/infrastructure/database/favourite/schemas";
import type { FavouriteListRepositoryPort } from "../app/ports/outbound/favourite-list.repository.port";
import type { FavouriteRepositoryPort } from "../app/ports/outbound/favourite.repository.port";
import { CreateListCommand } from "../app/use-cases/create-list.command";
import { RemoveListCommand } from "../app/use-cases/remove-list.command";
import { RenameListCommand } from "../app/use-cases/rename-list.command";
import { SetListsCommand } from "../app/use-cases/set-lists.command";
import { FavouriteList } from "../domain/aggregates/favourite-list.aggregate";
import type { Favourite } from "../domain/aggregates/favourite.aggregate";
import {
  DefaultListNotRemovableError,
  ListNameTakenError,
  ListNotYoursError,
  UnknownFavouriteTargetError,
} from "../domain/exceptions";
import type { FavouriteTarget } from "../domain/favourite-target";

/**
 * Implements the real `FavouriteListRepositoryPort`, not a loose shape typed
 * `as never` — a signature drift in Task 3's port must break this test, not
 * silently pass it. Same reasoning `quick-save.test.ts`'s fakes give.
 */
class FakeListRepo implements FavouriteListRepositoryPort {
  /** Flat, not per-user: every test here acts as "u1", so an id is either owned or it is not. */
  owned: string[] = [];
  rows: FavouriteList[] = [];
  saved: FavouriteList | null = null;
  renamedTo: string | null = null;
  removeCalledWith: { id: string; userId: string } | null = null;
  removeResult = true;

  /** Seeds a list as if it already existed, owned by `u1` unless told otherwise. */
  seed(p: { id?: string; userId?: string; name?: string | null; isDefault?: boolean; createdAt?: Date }): FavouriteList {
    const id = p.id ?? `seeded-${this.rows.length + 1}`;
    const list = FavouriteList.rehydrate({
      id,
      userId: p.userId ?? "u1",
      name: p.name ?? null,
      isDefault: p.isDefault ?? false,
      createdAt: p.createdAt ?? new Date(0),
    });
    this.rows.push(list);
    this.owned.push(id);
    return list;
  }

  async ensureDefault(): Promise<FavouriteList> {
    throw new Error("these commands do not call ensureDefault()");
  }

  async save(entity: FavouriteList): Promise<string> {
    this.saved = entity;
    return entity.id ?? "new-list";
  }

  async rename(p: { id: string; userId: string; name: string }): Promise<void> {
    this.renamedTo = p.name;
  }

  async remove(p: { id: string; userId: string }): Promise<boolean> {
    this.removeCalledWith = p;
    return this.removeResult;
  }

  async listForUser(userId: string): Promise<FavouriteList[]> {
    return this.rows.filter((l) => l.userId === userId);
  }

  async ownedBy(p: { userId: string; listIds: string[] }): Promise<string[]> {
    // Same `IN ()` guard the real adapter documents: an empty request is a
    // real one (every tick cleared), not an error.
    if (p.listIds.length === 0) return [];
    return p.listIds.filter((id) => this.owned.includes(id));
  }
}

interface FakeFavouriteRow {
  listId: string;
  userId: string;
  targetType: FavouriteTarget;
  targetId: string;
  createdAt: Date;
}

/** Implements the real `FavouriteRepositoryPort`, same reasoning as {@link FakeListRepo}. */
class FakeFavouriteRepo implements FavouriteRepositoryPort {
  rows: FakeFavouriteRow[] = [];
  setCalled = false;

  /** Seeds one or more entries as if some earlier save already filed them. */
  seed(...entries: { listId: string; targetId: string; userId?: string; targetType?: FavouriteTarget }[]): void {
    for (const e of entries) {
      this.rows.push({
        listId: e.listId,
        userId: e.userId ?? "u1",
        targetType: e.targetType ?? "service",
        targetId: e.targetId,
        createdAt: new Date(0),
      });
    }
  }

  async add(): Promise<void> {
    throw new Error("these commands do not call add()");
  }

  async setLists(p: {
    userId: string;
    targetType: FavouriteTarget;
    targetId: string;
    listIds: string[];
    now: Date;
  }): Promise<void> {
    this.setCalled = true;
    this.rows = this.rows.filter(
      (r) => !(r.userId === p.userId && r.targetType === p.targetType && r.targetId === p.targetId),
    );
    for (const listId of p.listIds) {
      this.rows.push({ listId, userId: p.userId, targetType: p.targetType, targetId: p.targetId, createdAt: p.now });
    }
  }

  async listsFor(p: { userId: string; targetType: FavouriteTarget; targetId: string }): Promise<string[]> {
    return this.rows
      .filter((r) => r.userId === p.userId && r.targetType === p.targetType && r.targetId === p.targetId)
      .map((r) => r.listId);
  }

  async markedFor(): Promise<string[]> {
    throw new Error("these commands do not call markedFor()");
  }

  async countsFor(): Promise<Map<string, number>> {
    throw new Error("these commands do not call countsFor()");
  }

  async coverTargetsFor(): Promise<Map<string, { targetType: FavouriteTarget; targetId: string }[]>> {
    throw new Error("these commands do not call coverTargetsFor()");
  }

  async entriesIn(): Promise<{ items: Favourite[]; nextCursor: string | null }> {
    throw new Error("these commands do not call entriesIn()");
  }
}

let lists: FakeListRepo;
let entries: FakeFavouriteRepo;

beforeEach(() => {
  lists = new FakeListRepo();
  entries = new FakeFavouriteRepo();
});

describe("SetListsCommand", () => {
  let command: SetListsCommand;

  beforeEach(() => {
    command = new SetListsCommand(lists, entries);
  });

  it("sets exactly the lists it was given", async () => {
    entries.seed({ listId: "a", targetId: "s1" }, { listId: "b", targetId: "s1" });
    lists.owned = ["b", "c"];
    const out = await command.execute({ requesterUserId: "u1", targetType: "service", targetId: "s1", listIds: ["b", "c"] });
    expect(out.listIds).toEqual(["b", "c"]);
    expect(await entries.listsFor({ userId: "u1", targetType: "service", targetId: "s1" })).toEqual(["b", "c"]);
  });

  it("unsaves the listing entirely when given no lists", async () => {
    // Unticking every row in the dialog is how somebody removes a favourite.
    // The heart empties, and there is no separate delete to find.
    entries.seed({ listId: "a", targetId: "s1" });
    await command.execute({ requesterUserId: "u1", targetType: "service", targetId: "s1", listIds: [] });
    expect(await entries.listsFor({ userId: "u1", targetType: "service", targetId: "s1" })).toEqual([]);
  });

  it("refuses a list that is not the caller's", async () => {
    // The one authorisation rule in this feature. Without it a caller can file
    // a listing into a stranger's list by sending its id.
    lists.owned = ["mine"];
    await expect(
      command.execute({ requesterUserId: "u1", targetType: "service", targetId: "s1", listIds: ["mine", "somebody-elses"] }),
    ).rejects.toThrow(ListNotYoursError);
  });

  it("refuses before writing anything, not halfway through", async () => {
    // A partial write leaves the listing in some of the lists asked for, and
    // the dialog and the lists then disagree with no way to tell which is
    // right.
    lists.owned = ["mine"];
    await expect(
      command.execute({ requesterUserId: "u1", targetType: "service", targetId: "s1", listIds: ["mine", "theirs"] }),
    ).rejects.toThrow();
    expect(entries.setCalled).toBe(false);
  });

  it("refuses a target kind the product cannot render, before checking ownership", async () => {
    // Nothing downstream would catch this — the column has no enum or check
    // constraint. `listIds` names a list nobody owns so that, if the target
    // guard were missing or ran second, this would fail as `ListNotYoursError`
    // instead, not silently pass.
    await expect(
      command.execute({ requesterUserId: "u1", targetType: "booking" as never, targetId: "s1", listIds: ["not-owned"] }),
    ).rejects.toThrow(UnknownFavouriteTargetError);
  });

  it("refuses a blank target id, before checking ownership", async () => {
    const promise = command.execute({
      requesterUserId: "u1",
      targetType: "service",
      targetId: "   ",
      listIds: ["not-owned"],
    });
    await expect(promise).rejects.toThrow();
    // Confirms which guard fired: the target check, not the ownership one —
    // an unowned list id is in `listIds`, and if ownership ran first this
    // would be `ListNotYoursError` instead.
    await promise.catch((error) => {
      expect(error).not.toBeInstanceOf(ListNotYoursError);
    });
  });
});

describe("CreateListCommand", () => {
  let command: CreateListCommand;

  beforeEach(() => {
    command = new CreateListCommand(lists);
  });

  it("refuses a name this person already has, ignoring case", async () => {
    // "Casa nova" and "casa nova" are the same list to whoever typed them and
    // two identical rows in the dialog to everybody else.
    lists.seed({ name: "Casa nova" });
    await expect(command.execute({ requesterUserId: "u1", name: "casa nova" })).rejects.toThrow(ListNameTakenError);
  });

  it("lets two different people use the same name", async () => {
    // Names are unique within a person, never across the platform.
    lists.seed({ userId: "u2", name: "Casa nova" });
    const out = await command.execute({ requesterUserId: "u1", name: "Casa nova" });
    expect(out.id).toBeTruthy();
    expect(lists.saved!.userId).toBe("u1");
  });

  it("never creates a second default", async () => {
    // Only ensureDefault does that.
    const out = await command.execute({ requesterUserId: "u1", name: "Casa nova" });
    expect(lists.saved!.isDefault).toBe(false);
    expect(out.id).toBe(lists.saved!.id ?? "new-list");
  });

  it("refuses a blank name as invalid, not as a collision with the nameless default", async () => {
    // `input.name.trim()` on a blank name is `""`, and coercing the default
    // list's `null` name to `""` for the comparison used to make `"" === ""`
    // a match — so a blank name surfaced as `ListNameTakenError` (a 409
    // saying "you already have a list called '   '") instead of the
    // validation error `FavouriteList.assertName` exists to raise.
    lists.seed({ isDefault: true, name: null });
    const promise = command.execute({ requesterUserId: "u1", name: "   " });
    await expect(promise).rejects.toThrow();
    await promise.catch((error) => {
      expect(error).not.toBeInstanceOf(ListNameTakenError);
    });
  });

  it("does not let the nameless default collide with a name somebody actually picks", async () => {
    // A nameless default is not a list named "" — the scan must skip a
    // `null` name outright rather than coerce it to the empty string.
    lists.seed({ isDefault: true, name: null });
    const out = await command.execute({ requesterUserId: "u1", name: "Casa nova" });
    expect(out.id).toBeTruthy();
  });
});

describe("RemoveListCommand", () => {
  let command: RemoveListCommand;

  beforeEach(() => {
    command = new RemoveListCommand(lists);
  });

  it("refuses the default list", async () => {
    // Deleting it would leave the heart with nowhere to save to.
    lists.seed({ id: "d", isDefault: true });
    await expect(command.execute({ requesterUserId: "u1", listId: "d" })).rejects.toThrow(DefaultListNotRemovableError);
  });

  it("refuses a list that is not the caller's", async () => {
    await expect(command.execute({ requesterUserId: "u1", listId: "theirs" })).rejects.toThrow(ListNotYoursError);
  });

  it("removes a list that is the caller's and not the default", async () => {
    lists.seed({ id: "a", name: "Casa nova" });
    const out = await command.execute({ requesterUserId: "u1", listId: "a" });
    expect(out).toEqual({ removed: true });
    expect(lists.removeCalledWith).toEqual({ id: "a", userId: "u1" });
  });

  it("takes the list's entries with it and no others", () => {
    // By cascade, which is the database's job — this asserts the cascade is
    // actually declared, not that the command deletes rows itself.
    const fks = getTableConfig(favourite).foreignKeys;
    expect(fks).toHaveLength(1);
    expect(fks[0]!.onDelete).toBe("cascade");
  });
});

describe("RenameListCommand", () => {
  let command: RenameListCommand;

  beforeEach(() => {
    command = new RenameListCommand(lists);
  });

  it("allows renaming the default, which then stops being nameless", async () => {
    lists.seed({ id: "d", isDefault: true, name: null });
    await command.execute({ requesterUserId: "u1", listId: "d", name: "A minha lista" });
    expect(lists.renamedTo).toBe("A minha lista");
  });

  it("refuses a name another of this person's lists already has", async () => {
    lists.seed({ id: "a", name: "Casa nova" });
    lists.seed({ id: "b", name: "Urgente" });
    await expect(command.execute({ requesterUserId: "u1", listId: "b", name: "Casa nova" })).rejects.toThrow(ListNameTakenError);
  });

  it("lets a list keep its own name", async () => {
    // Renaming "Casa nova" to "Casa nova" is a no-op, not a conflict with
    // itself.
    lists.seed({ id: "a", name: "Casa nova" });
    await expect(command.execute({ requesterUserId: "u1", listId: "a", name: "Casa nova" })).resolves.toBeUndefined();
  });

  it("refuses a list that is not the caller's", async () => {
    await expect(command.execute({ requesterUserId: "u1", listId: "theirs", name: "Anything" })).rejects.toThrow(
      ListNotYoursError,
    );
  });
});
