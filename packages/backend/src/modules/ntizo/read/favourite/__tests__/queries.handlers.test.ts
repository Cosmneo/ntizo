import { describe, expect, it } from "bun:test";
import { getGraphQLErrorCode } from "@cosmneo/onion-lasagna";
import type { NtizoGraphqlContext } from "../../../graphql/context";
import {
  CursorInvalidError,
  ListNotYoursError,
} from "../../../bounded-contexts/favourite/domain/exceptions";
import type { FavouriteTarget } from "../../../bounded-contexts/favourite/domain/favourite-target";
import type { FavouriteListRepositoryPort } from "../../../bounded-contexts/favourite/app/ports/outbound/favourite-list.repository.port";
import type { FavouriteRepositoryPort } from "../../../bounded-contexts/favourite/app/ports/outbound/favourite.repository.port";
import type { Favourite } from "../../../bounded-contexts/favourite/domain/aggregates/favourite.aggregate";
import type { FavouriteList } from "../../../bounded-contexts/favourite/domain/aggregates/favourite-list.aggregate";
import type { ServiceCardReaderPort } from "../app/ports/outbound/service-card-reader.port";
import type { ProviderCardReaderPort } from "../app/ports/outbound/provider-card-reader.port";
import { ListMyListsProjection } from "../app/use-cases/list-my-lists.projection";
import { ListListEntriesProjection } from "../app/use-cases/list-list-entries.projection";
import { MarkFavouritesProjection } from "../app/use-cases/mark-favourites.projection";
import { ListsForTargetProjection } from "../app/use-cases/lists-for-target.projection";
import { createFavouriteReadHandlers, type FavouriteReadModule } from "../graphql/handlers/queries.handlers";
import type { FavouriteReadBootstrap } from "../bootstrap";
import {
  favouriteReadSchema,
  listEntries,
  listMyLists,
  listsForTarget,
  markMyFavourites,
} from "../graphql/schema/queries";

function ctx(overrides: Partial<NtizoGraphqlContext> = {}): NtizoGraphqlContext {
  return {
    requesterUserId: "u-session",
    email: null,
    firstName: null,
    lastName: null,
    role: "customer",
    requestId: null,
    ipAddress: null,
    userAgent: null,
    ...overrides,
  };
}

/** Every read, and the user id it was made with, is recorded — not just the outcome. */
class RecordingListRepository implements FavouriteListRepositoryPort {
  public readonly calls: string[] = [];

  async ensureDefault(): Promise<FavouriteList> {
    throw new Error("unused");
  }
  async save(): Promise<string> {
    throw new Error("unused");
  }
  async rename(): Promise<void> {
    throw new Error("unused");
  }
  async remove(): Promise<boolean> {
    throw new Error("unused");
  }
  async listForUser(userId: string): Promise<FavouriteList[]> {
    this.calls.push(`listForUser:${userId}`);
    return [];
  }
  async ownedBy(p: { userId: string; listIds: string[] }): Promise<string[]> {
    this.calls.push(`ownedBy:${p.userId}:${p.listIds.join(",")}`);
    return [];
  }
}

class RecordingFavouriteRepository implements FavouriteRepositoryPort {
  public readonly calls: string[] = [];

  async add(): Promise<void> {
    throw new Error("unused");
  }
  async setLists(): Promise<void> {
    throw new Error("unused");
  }
  async listsFor(p: { userId: string; targetType: FavouriteTarget; targetId: string }): Promise<string[]> {
    this.calls.push(`listsFor:${p.userId}:${p.targetType}:${p.targetId}`);
    return [];
  }
  async markedFor(p: {
    userId: string;
    targetType: FavouriteTarget;
    targetIds: string[];
  }): Promise<string[]> {
    this.calls.push(`markedFor:${p.userId}:${p.targetType}:${p.targetIds.join(",")}`);
    return [];
  }
  async countsFor(): Promise<Map<string, number>> {
    this.calls.push("countsFor");
    return new Map();
  }
  async coverTargetsFor(): Promise<Map<string, { targetType: FavouriteTarget; targetId: string }[]>> {
    this.calls.push("coverTargetsFor");
    return new Map();
  }
  async entriesIn(): Promise<{ items: Favourite[]; nextCursor: string | null }> {
    this.calls.push("entriesIn");
    return { items: [], nextCursor: null };
  }
}

const noServices: ServiceCardReaderPort = { findByIds: async () => [] };
const noProviders: ProviderCardReaderPort = { findByIds: async () => [] };

function makeModule(lists: RecordingListRepository, favourites: RecordingFavouriteRepository): FavouriteReadModule {
  return {
    favouriteRead: {
      adapters: {} as never,
      useCases: {
        listMine: new ListMyListsProjection(lists, favourites, noServices, noProviders),
        listById: new ListListEntriesProjection(lists, favourites, noServices, noProviders),
        marked: new MarkFavouritesProjection(favourites),
        listsForTarget: new ListsForTargetProjection(favourites),
      },
    } as FavouriteReadBootstrap,
  };
}

describe("the favourite read schema", () => {
  /**
   * The field kit flattens a nested schema key: `{ favourite: { marked } }`
   * emits on the wire as `favouriteMarked`, never `favourite.marked`. Task 8
   * mounts these and Task 9's frontend calls them by the flattened names, and
   * a previous phase of this project lost a round to exactly this — so the
   * four names are pinned here rather than read off a running server once.
   */
  it("exposes four fields under two groups", () => {
    const fields = (favouriteReadSchema as unknown as {
      fields: { favourite: object; favouriteList: object };
    }).fields;
    expect(Object.keys(fields.favourite).sort()).toEqual(["listsFor", "marked"]);
    expect(Object.keys(fields.favouriteList).sort()).toEqual(["byId", "mine"]);
  });

  it("takes no user id on any input schema — the session is the answer", () => {
    const shapeOf = (field: { input: unknown }) =>
      Object.keys(
        (field.input as { _schema?: { shape?: Record<string, unknown> } })._schema?.shape ?? {},
      ).sort();

    expect(shapeOf(markMyFavourites)).toEqual(["targetIds", "targetType"]);
    expect(shapeOf(listsForTarget)).toEqual(["targetId", "targetType"]);
    expect(shapeOf(listMyLists)).toEqual([]);
    expect(shapeOf(listEntries)).toEqual(["cursor", "id", "limit", "locale"]);
  });

  it("caps the ids a marks query may ask about at one page", () => {
    // 48 — the server's existing page cap. Unbounded, it is a way to hand the
    // database an arbitrarily long `IN` list.
    const parsed = (markMyFavourites.input as {
      _schema: { shape: { targetIds: { safeParse: (v: unknown) => { success: boolean } } } };
    })._schema.shape.targetIds;
    expect(parsed.safeParse(Array.from({ length: 48 }, (_, i) => `s${i}`)).success).toBe(true);
    expect(parsed.safeParse(Array.from({ length: 49 }, (_, i) => `s${i}`)).success).toBe(false);
  });
});

describe("createFavouriteReadHandlers", () => {
  it("builds exactly the four fields", () => {
    const handlers = createFavouriteReadHandlers(
      makeModule(new RecordingListRepository(), new RecordingFavouriteRepository()),
    );
    expect(handlers.map((h) => h.key).sort()).toEqual([
      "favourite.listsFor",
      "favourite.marked",
      "favouriteList.byId",
      "favouriteList.mine",
    ]);
  });

  it("refuses an anonymous caller on every field, before anything is read", async () => {
    // Everything here is somebody's own. An anonymous caller gets a refusal,
    // not an empty page that looks like "you have saved nothing".
    for (const key of ["favourite.marked", "favourite.listsFor", "favouriteList.mine", "favouriteList.byId"]) {
      const lists = new RecordingListRepository();
      const favourites = new RecordingFavouriteRepository();
      const field = createFavouriteReadHandlers(makeModule(lists, favourites)).find((h) => h.key === key)!;

      await expect(
        field.handler(
          { targetType: "service", targetIds: ["a"], targetId: "a", id: "l1" },
          ctx({ requesterUserId: null }),
        ),
      ).rejects.toThrow("Sign in to see what you saved");

      expect(lists.calls).toEqual([]);
      expect(favourites.calls).toEqual([]);
    }
  });

  /**
   * The boundary the client actually talks to is the built field's `.handler`,
   * not the projection directly — a regression could leave a handler reading
   * an id off `args` while every projection test stays green. So this drives
   * the real handler with raw args carrying an attacker-supplied id under an
   * unrelated field name.
   */
  it("stamps requesterUserId from the session, ignoring any id raw args smuggle in", async () => {
    const favourites = new RecordingFavouriteRepository();
    const field = createFavouriteReadHandlers(makeModule(new RecordingListRepository(), favourites)).find(
      (h) => h.key === "favourite.marked",
    )!;

    await field.handler(
      { requesterUserId: "victim", userId: "victim", targetType: "service", targetIds: ["a", "b"] },
      ctx({ requesterUserId: "u-session" }),
    );

    expect(favourites.calls).toEqual(["markedFor:u-session:service:a,b"]);
  });

  it("a second caller's session reads only that caller's own rows", async () => {
    const favourites = new RecordingFavouriteRepository();
    const field = createFavouriteReadHandlers(makeModule(new RecordingListRepository(), favourites)).find(
      (h) => h.key === "favourite.listsFor",
    )!;

    await field.handler({ targetType: "service", targetId: "s1" }, ctx({ requesterUserId: "user-a" }));
    await field.handler({ targetType: "service", targetId: "s1" }, ctx({ requesterUserId: "user-b" }));

    expect(favourites.calls).toEqual([
      "listsFor:user-a:service:s1",
      "listsFor:user-b:service:s1",
    ]);
  });

  it("passes the list id through to the projection, which then refuses it", async () => {
    // The handler does not check ownership — that is a database read and the
    // kit's argsMapper is synchronous. It hands the claimed id to the
    // projection, whose scoped `listForUser` is what refuses it.
    const lists = new RecordingListRepository();
    const favourites = new RecordingFavouriteRepository();
    const field = createFavouriteReadHandlers(makeModule(lists, favourites)).find(
      (h) => h.key === "favouriteList.byId",
    )!;

    await expect(field.handler({ id: "theirs" }, ctx({ requesterUserId: "u1" }))).rejects.toThrow();

    expect(lists.calls).toEqual(["listForUser:u1"]);
    expect(favourites.calls).toEqual([]);
  });
});

/**
 * The two refusals `favouriteListById` makes client-facing.
 *
 * Both classes claim in their own doc comments that they reach a caller as
 * something other than a generic 500, and neither claim was enforced
 * anywhere: `repositories.test.ts` asserts `rejects.toThrow(CursorInvalidError)`,
 * which is `instanceof`-based and stays green even if the class stopped
 * extending a kit error type. What a client actually sees is the string
 * `getGraphQLErrorCode` produces.
 *
 * Asserted here rather than beside the exceptions' own domain tests, for the
 * reason `read/activity`'s equivalent file records: this task's field is what
 * makes a caller-supplied `cursor` and a caller-supplied list id reach the
 * repository at all. Before it, nothing fed an external value into either.
 */
describe("the refusals this field makes client-facing", () => {
  it("does not mask a bad cursor to INTERNAL_ERROR — it maps to UNPROCESSABLE", () => {
    expect(getGraphQLErrorCode(new CursorInvalidError("not-a-real-cursor"))).toBe("UNPROCESSABLE");
  });

  it("does not mask a stranger's list to INTERNAL_ERROR — it maps to FORBIDDEN", () => {
    // A reader who follows a stale link has to be told it is not theirs, not
    // that the server broke.
    expect(getGraphQLErrorCode(new ListNotYoursError("theirs"))).toBe("FORBIDDEN");
  });
});
