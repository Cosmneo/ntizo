import { beforeEach, describe, expect, it } from "bun:test";
import type { FavouriteListRepositoryPort } from "../app/ports/outbound/favourite-list.repository.port";
import type { FavouriteRepositoryPort } from "../app/ports/outbound/favourite.repository.port";
import { QuickSaveCommand } from "../app/use-cases/quick-save.command";
import { FavouriteList } from "../domain/aggregates/favourite-list.aggregate";
import type { Favourite } from "../domain/aggregates/favourite.aggregate";
import type { FavouriteTarget } from "../domain/favourite-target";

/**
 * Implements the real port, not a loose shape typed `as never` — a signature
 * drift in Task 3's `FavouriteListRepositoryPort` must break this test, not
 * silently pass it.
 */
class FakeListRepo implements FavouriteListRepositoryPort {
  ensuredFor: string | null = null;

  async ensureDefault(userId: string, now: Date): Promise<FavouriteList> {
    this.ensuredFor = userId;
    return FavouriteList.rehydrate({
      id: "default-list",
      userId,
      name: null,
      isDefault: true,
      createdAt: now,
    });
  }

  async save(): Promise<string> {
    throw new Error("QuickSaveCommand does not call save()");
  }

  async rename(): Promise<void> {
    throw new Error("QuickSaveCommand does not call rename()");
  }

  async remove(): Promise<boolean> {
    throw new Error("QuickSaveCommand does not call remove()");
  }

  async listForUser(): Promise<FavouriteList[]> {
    throw new Error("QuickSaveCommand does not call listForUser()");
  }

  async ownedBy(): Promise<string[]> {
    throw new Error("QuickSaveCommand does not call ownedBy()");
  }
}

interface FakeRow {
  listId: string;
  userId: string;
  targetType: FavouriteTarget;
  targetId: string;
}

/** Implements the real `FavouriteRepositoryPort`, same reasoning as {@link FakeListRepo}. */
class FakeFavouriteRepo implements FavouriteRepositoryPort {
  rows: FakeRow[] = [];
  added: Favourite | null = null;

  /** Seeds an entry as if some earlier save had already filed it. Defaults to this test's user and target kind. */
  seed(p: { listId: string; targetId: string; userId?: string; targetType?: FavouriteTarget }): void {
    this.rows.push({
      listId: p.listId,
      userId: p.userId ?? "u1",
      targetType: p.targetType ?? "service",
      targetId: p.targetId,
    });
  }

  async add(entity: Favourite): Promise<void> {
    this.added = entity;
    // Mirrors the real adapter's `ON CONFLICT DO NOTHING`: the same
    // (list, user, type, target) combination is never filed twice.
    const already = this.rows.some(
      (r) =>
        r.listId === entity.listId &&
        r.userId === entity.userId &&
        r.targetType === entity.targetType &&
        r.targetId === entity.targetId,
    );
    if (!already) {
      this.rows.push({
        listId: entity.listId,
        userId: entity.userId,
        targetType: entity.targetType,
        targetId: entity.targetId,
      });
    }
  }

  async setLists(): Promise<void> {
    throw new Error("QuickSaveCommand does not call setLists()");
  }

  async listsFor(p: { userId: string; targetType: FavouriteTarget; targetId: string }): Promise<string[]> {
    return this.rows
      .filter((r) => r.userId === p.userId && r.targetType === p.targetType && r.targetId === p.targetId)
      .map((r) => r.listId);
  }

  async markedFor(): Promise<string[]> {
    throw new Error("QuickSaveCommand does not call markedFor()");
  }

  async countsFor(): Promise<Map<string, number>> {
    throw new Error("QuickSaveCommand does not call countsFor()");
  }

  async coverTargetsFor(): Promise<Map<string, { targetType: FavouriteTarget; targetId: string }[]>> {
    throw new Error("QuickSaveCommand does not call coverTargetsFor()");
  }

  async entriesIn(): Promise<{ items: Favourite[]; nextCursor: string | null }> {
    throw new Error("QuickSaveCommand does not call entriesIn()");
  }
}

let lists: FakeListRepo;
let entries: FakeFavouriteRepo;
let command: QuickSaveCommand;

beforeEach(async () => {
  lists = new FakeListRepo();
  entries = new FakeFavouriteRepo();
  command = new QuickSaveCommand(lists, entries);
  // The very first save of the session — primes the default list the way a
  // real first heart-tap would, so every test below runs against a person
  // who has already saved once.
  await command.execute({ requesterUserId: "u1", targetType: "service", targetId: "s1" });
});

describe("QuickSaveCommand", () => {
  it("creates the default list on the very first save", () => {
    // Lazily, not at sign-up: a row for every account that never saves
    // anything is a table full of nothing.
    expect(lists.ensuredFor).toBe("u1");
  });

  it("files the listing into the default list", async () => {
    const out = await command.execute({ requesterUserId: "u1", targetType: "service", targetId: "s1" });
    expect(out.listIds).toEqual(["default-list"]);
  });

  it("is idempotent — a second press changes nothing", async () => {
    // A double-tap on a slow connection, or the same card in two tabs. Neither
    // may create a second row, a second list, or an error.
    await command.execute({ requesterUserId: "u1", targetType: "service", targetId: "s1" });
    const out = await command.execute({ requesterUserId: "u1", targetType: "service", targetId: "s1" });
    expect(out.listIds).toEqual(["default-list"]);
    expect(entries.rows).toHaveLength(1);
  });

  it("leaves a listing already filed elsewhere where it is, and adds the default", async () => {
    // Pressing the heart on a card whose listing lives in "Casa nova" must not
    // move it out of "Casa nova".
    entries.seed({ listId: "casa-nova", targetId: "s1" });
    const out = await command.execute({ requesterUserId: "u1", targetType: "service", targetId: "s1" });
    expect(out.listIds.sort()).toEqual(["casa-nova", "default-list"]);
  });

  it("stamps the owner from the caller, never from the input", async () => {
    // The command takes `requesterUserId` and nothing else naming a person.
    // There is no argument a caller could send to save into somebody else's
    // list.
    await command.execute({ requesterUserId: "u1", targetType: "service", targetId: "s1" });
    expect(entries.added!.userId).toBe("u1");
  });

  it("refuses a target kind the product cannot render", async () => {
    await expect(
      command.execute({ requesterUserId: "u1", targetType: "booking" as never, targetId: "b1" }),
    ).rejects.toThrow();
  });

  it("does not check that the target exists", async () => {
    // Deliberate, and worth stating: verifying it would mean this context
    // querying Catalog and Provider, which is the boundary the missing foreign
    // key exists to keep. A favourite pointing at nothing is dropped on read,
    // where those two contexts are already being consulted anyway.
    await expect(
      command.execute({
        requesterUserId: "u1",
        targetType: "service",
        targetId: "00000000-0000-0000-0000-000000000000",
      }),
    ).resolves.toBeDefined();
  });
});
