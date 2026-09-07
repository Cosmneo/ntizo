import { beforeEach, describe, expect, it } from "bun:test";
import {
  FAVOURITE_COVER_TILES,
  type ProviderPublicDTO,
  type ServiceDTO,
} from "@ntizo/shared/read-models";
import { Favourite } from "../../../bounded-contexts/favourite/domain/aggregates/favourite.aggregate";
import { FavouriteList } from "../../../bounded-contexts/favourite/domain/aggregates/favourite-list.aggregate";
import type { FavouriteTarget } from "../../../bounded-contexts/favourite/domain/favourite-target";
import type { FavouriteListRepositoryPort } from "../../../bounded-contexts/favourite/app/ports/outbound/favourite-list.repository.port";
import type { FavouriteRepositoryPort } from "../../../bounded-contexts/favourite/app/ports/outbound/favourite.repository.port";
import type { ServiceCardReaderPort } from "../app/ports/outbound/service-card-reader.port";
import type { ProviderCardReaderPort } from "../app/ports/outbound/provider-card-reader.port";
import {
  ListMyListsProjection,
  MAX_LISTS_WITH_COVERS,
} from "../app/use-cases/list-my-lists.projection";
import { ListListEntriesProjection } from "../app/use-cases/list-list-entries.projection";
import { MarkFavouritesProjection } from "../app/use-cases/mark-favourites.projection";
import { ListsForTargetProjection } from "../app/use-cases/lists-for-target.projection";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function at(iso: string): Date {
  return new Date(iso);
}

function serviceCard(id: string, imageUrls: string[] = []): ServiceDTO {
  return {
    id,
    providerId: `prov-of-${id}`,
    providerName: "Hélder Cossa",
    providerSlug: `helder-${id}`,
    providerType: "individual",
    providerVerified: true,
    providerRatingAverage: 4.8,
    providerReviewCount: 37,
    categoryCode: "plumbing",
    categoryName: "Canalização",
    name: `Service ${id}`,
    description: null,
    locationType: "at_customer",
    bookingMode: "priced",
    imageUrls,
    defaultOption: null,
    fromAmountMinor: 50000,
    optionCount: 1,
    isFallback: false,
  };
}

function providerCard(id: string, logoUrl: string | null = null, photoUrls: string[] = []): ProviderPublicDTO {
  return {
    id,
    name: `Provider ${id}`,
    slug: `provider-${id}`,
    type: "organization",
    description: null,
    city: "Maputo",
    district: null,
    country: "MZ",
    logoUrl,
    photoUrls,
    verified: false,
    ratingAverage: null,
    reviewCount: 0,
    categories: [],
    serviceCount: 2,
    fromAmountMinor: null,
    fromCurrency: null,
  };
}

interface ListRow {
  id: string;
  userId: string;
  name: string | null;
  isDefault: boolean;
  createdAt: Date;
}

interface FavouriteRow {
  listId: string;
  userId: string;
  targetType: FavouriteTarget;
  targetId: string;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Fakes — each implements the real port, so a signature that drifts is a
// compile error here rather than a surprise in production.
// ---------------------------------------------------------------------------

/**
 * The write methods throw rather than no-op: nothing on the read side may
 * write, and a silent no-op would let a projection that called one pass.
 */
class FakeFavouriteListRepository implements FavouriteListRepositoryPort {
  public ownedByCalls = 0;
  public listForUserCalls = 0;

  constructor(private readonly rows: ListRow[] = []) {}

  async ensureDefault(): Promise<FavouriteList> {
    throw new Error("the read side must never create a list");
  }

  async save(): Promise<string> {
    throw new Error("the read side must never write a list");
  }

  async rename(): Promise<void> {
    throw new Error("the read side must never rename a list");
  }

  async remove(): Promise<boolean> {
    throw new Error("the read side must never remove a list");
  }

  /**
   * Newest first — exactly what `DrizzleFavouriteListRepository` returns, and
   * the whole reason `ListMyListsProjection` has ordering of its own: the
   * default list is the oldest, so this hands it back LAST.
   */
  async listForUser(userId: string): Promise<FavouriteList[]> {
    this.listForUserCalls += 1;
    return this.rows
      .filter((r) => r.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((r) => FavouriteList.rehydrate({ ...r }));
  }

  async ownedBy(p: { userId: string; listIds: string[] }): Promise<string[]> {
    this.ownedByCalls += 1;
    return p.listIds.filter((id) => this.rows.some((r) => r.id === id && r.userId === p.userId));
  }
}

class FakeFavouriteRepository implements FavouriteRepositoryPort {
  public countCalls = 0;
  public coverCalls = 0;
  /** Which lists `coverTargetsFor` was actually asked about — the bound is applied before the query, not after it. */
  public coveredListIds: string[] = [];
  /** The limit `entriesIn` was actually handed. `undefined` means it was never called. */
  public limit: number | undefined;
  public cursor: string | null | undefined;
  /** What `markedFor` was asked. `undefined` means it was never called. */
  public marked: { userId: string; targetType: FavouriteTarget; targetIds: string[] } | undefined;

  constructor(private readonly rows: FavouriteRow[] = []) {}

  async add(): Promise<void> {
    throw new Error("the read side must never file a favourite");
  }

  async setLists(): Promise<void> {
    throw new Error("the read side must never set lists");
  }

  async listsFor(p: { userId: string; targetType: FavouriteTarget; targetId: string }): Promise<string[]> {
    return this.rows
      .filter((r) => r.userId === p.userId && r.targetType === p.targetType && r.targetId === p.targetId)
      .map((r) => r.listId);
  }

  /**
   * Deliberately **not** deduped, though the real port promises it is.
   *
   * A listing in three lists is three rows, and the naive join returns three.
   * Returning them here is what makes `MarkFavouritesProjection`'s own
   * guarantee testable — if the fake deduped, the test would be pinning the
   * fake rather than the projection.
   */
  async markedFor(p: { userId: string; targetType: FavouriteTarget; targetIds: string[] }): Promise<string[]> {
    this.marked = p;
    return this.rows
      .filter(
        (r) => r.userId === p.userId && r.targetType === p.targetType && p.targetIds.includes(r.targetId),
      )
      .map((r) => r.targetId);
  }

  /**
   * A `GROUP BY` has no row for a list with no entries, so an empty list is
   * **absent** from this map rather than present with zero. Reading it as
   * `map.size`, or assuming every id appears, is the bug this reproduces.
   */
  async countsFor(listIds: string[]): Promise<Map<string, number>> {
    this.countCalls += 1;
    const counts = new Map<string, number>();
    for (const row of this.rows) {
      if (!listIds.includes(row.listId)) continue;
      counts.set(row.listId, (counts.get(row.listId) ?? 0) + 1);
    }
    return counts;
  }

  async coverTargetsFor(p: {
    listIds: string[];
    perList: number;
  }): Promise<Map<string, { targetType: FavouriteTarget; targetId: string }[]>> {
    this.coverCalls += 1;
    this.coveredListIds = p.listIds;
    const covers = new Map<string, { targetType: FavouriteTarget; targetId: string }[]>();
    for (const listId of p.listIds) {
      const targets = this.rows
        .filter((r) => r.listId === listId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, p.perList)
        .map((r) => ({ targetType: r.targetType, targetId: r.targetId }));
      if (targets.length > 0) covers.set(listId, targets);
    }
    return covers;
  }

  /**
   * Takes the list id on trust, exactly as the real one does — which is why
   * the projection has to prove ownership before reaching this.
   *
   * `nextCursor` is built from the last row **this method returned**, never
   * from what the caller went on to keep.
   */
  async entriesIn(p: {
    listId: string;
    limit: number;
    cursor?: string | null;
  }): Promise<{ items: Favourite[]; nextCursor: string | null }> {
    this.limit = p.limit;
    this.cursor = p.cursor ?? null;
    const all = this.rows
      .filter((r) => r.listId === p.listId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const taken = all.slice(0, p.limit);
    const last = taken[taken.length - 1];
    return {
      items: taken.map((r) => Favourite.rehydrate({ ...r })),
      nextCursor: all.length > taken.length && last ? `${last.createdAt.toISOString()}|${last.targetId}` : null,
    };
  }
}

class FakeServiceCards implements ServiceCardReaderPort {
  public calls = 0;
  public askedLocale: string | undefined;
  public askedIds: string[] = [];

  constructor(private readonly known: ServiceDTO[] = []) {}

  async findByIds(p: { ids: string[]; locale: string }): Promise<ServiceDTO[]> {
    this.calls += 1;
    this.askedLocale = p.locale;
    this.askedIds = p.ids;
    return this.known.filter((s) => p.ids.includes(s.id));
  }
}

class FakeProviderCards implements ProviderCardReaderPort {
  public calls = 0;
  public askedLocale: string | undefined;
  public askedIds: string[] = [];

  constructor(private readonly known: ProviderPublicDTO[] = []) {}

  async findByIds(p: { ids: string[]; locale: string }): Promise<ProviderPublicDTO[]> {
    this.calls += 1;
    this.askedLocale = p.locale;
    this.askedIds = p.ids;
    return this.known.filter((s) => p.ids.includes(s.id));
  }
}

// ---------------------------------------------------------------------------
// ListMyListsProjection
// ---------------------------------------------------------------------------

describe("ListMyListsProjection", () => {
  // The default list is the OLDEST, so `listForUser`'s newest-first order puts
  // it last. `empty` is newer and holds nothing.
  const lists: ListRow[] = [
    { id: "default", userId: "u1", name: null, isDefault: true, createdAt: at("2026-01-01T00:00:00.000Z") },
    { id: "empty", userId: "u1", name: "Casa nova", isDefault: false, createdAt: at("2026-02-01T00:00:00.000Z") },
  ];

  const rows: FavouriteRow[] = [
    { listId: "default", userId: "u1", targetType: "service", targetId: "deleted", createdAt: at("2026-03-03T00:00:00.000Z") },
    { listId: "default", userId: "u1", targetType: "provider", targetId: "p1", createdAt: at("2026-03-02T00:00:00.000Z") },
    { listId: "default", userId: "u1", targetType: "service", targetId: "s1", createdAt: at("2026-03-01T00:00:00.000Z") },
  ];

  let entries: FakeFavouriteRepository;
  let services: FakeServiceCards;
  let providers: FakeProviderCards;
  let projection: ListMyListsProjection;

  beforeEach(() => {
    entries = new FakeFavouriteRepository(rows);
    services = new FakeServiceCards([serviceCard("s1", ["https://cdn/s1.jpg"])]);
    providers = new FakeProviderCards([providerCard("p1", "https://cdn/p1-logo.jpg")]);
    projection = new ListMyListsProjection(new FakeFavouriteListRepository(lists), entries, services, providers);
  });

  it("returns nothing at all for somebody who has never saved", async () => {
    // The default list is created on first save, not at sign-up. Inventing one
    // here would be a query with a side effect, and the page would show an
    // empty list to somebody who has no lists.
    const empty = new ListMyListsProjection(
      new FakeFavouriteListRepository([]),
      new FakeFavouriteRepository([]),
      new FakeServiceCards(),
      new FakeProviderCards(),
    );
    expect(await empty.execute({ requesterUserId: "u1" })).toEqual([]);
  });

  it("asks the repositories nothing at all when there are no lists", async () => {
    // No lists means no ids to count, cover or resolve. Three queries that can
    // only return nothing are three round trips bought for a page that is
    // already known to be empty.
    const noLists = new FakeFavouriteRepository([]);
    const noServices = new FakeServiceCards();
    const noProviders = new FakeProviderCards();
    await new ListMyListsProjection(
      new FakeFavouriteListRepository([]),
      noLists,
      noServices,
      noProviders,
    ).execute({ requesterUserId: "u1" });
    expect(noLists.countCalls).toBe(0);
    expect(noLists.coverCalls).toBe(0);
    expect(noServices.calls).toBe(0);
    expect(noProviders.calls).toBe(0);
  });

  it("puts the default list first", async () => {
    // It is where the heart saves. Anywhere else in the order and the dialog's
    // pre-ticked row is somewhere down the scroll.
    const out = await projection.execute({ requesterUserId: "u1" });
    expect(out[0]!.isDefault).toBe(true);
  });

  it("keeps the repository's newest-first order among the rest", async () => {
    // Only the default is lifted. Re-sorting the others would throw away the
    // order the repository chose, which is the order the index page reads in.
    const many = [
      ...lists,
      { id: "newest", userId: "u1", name: "Obras", isDefault: false, createdAt: at("2026-05-01T00:00:00.000Z") },
    ];
    const out = await new ListMyListsProjection(
      new FakeFavouriteListRepository(many),
      new FakeFavouriteRepository([]),
      new FakeServiceCards(),
      new FakeProviderCards(),
    ).execute({ requesterUserId: "u1" });
    expect(out.map((l) => l.id)).toEqual(["default", "newest", "empty"]);
  });

  it("counts each list, and counts zero for an empty one", async () => {
    const out = await projection.execute({ requesterUserId: "u1" });
    expect(out.map((l) => l.itemCount)).toEqual([3, 0]);
  });

  it("counts the rows in the list, not the ones that still resolve", async () => {
    // Three rows, one of them pointing at a service that is gone. The count is
    // of what is saved; the covers are of what can still be drawn. Making the
    // count agree with the covers would mean resolving every entry of every
    // list to print a number.
    const out = await projection.execute({ requesterUserId: "u1" });
    expect(out[0]!.itemCount).toBe(3);
    expect(out[0]!.coverUrls).toHaveLength(2);
  });

  it("asks for the counts and the covers once, not once per list", async () => {
    // Twelve lists must not be twenty-four queries.
    await projection.execute({ requesterUserId: "u1" });
    expect(entries.countCalls).toBe(1);
    expect(entries.coverCalls).toBe(1);
  });

  it("resolves every list's cover targets in one call per kind", async () => {
    // Same rule one level down: the covers of twelve lists are two queries,
    // not twenty-four.
    await projection.execute({ requesterUserId: "u1" });
    expect(services.calls).toBe(1);
    expect(providers.calls).toBe(1);
  });

  it("returns fewer than four covers rather than padding them", async () => {
    // A list of two, or of listings with no photographs. The client draws the
    // gaps; four broken images is worse than two real ones.
    const out = await projection.execute({ requesterUserId: "u1" });
    expect(out[0]!.coverUrls.length).toBeLessThanOrEqual(4);
  });

  it("gives an empty list no covers at all", async () => {
    const out = await projection.execute({ requesterUserId: "u1" });
    expect(out[1]!.coverUrls).toEqual([]);
  });

  it("leaves out a cover for a listing that no longer resolves", async () => {
    // The deleted service holds a position in the list's four most recent, and
    // it must not become a broken tile.
    const out = await projection.execute({ requesterUserId: "u1" });
    expect(out[0]!.coverUrls).toEqual(["https://cdn/p1-logo.jpg", "https://cdn/s1.jpg"]);
  });

  it("carries the default list's null name through rather than inventing one", async () => {
    // The client translates it. A name resolved here would bake the reader's
    // language into an answer keyed on nothing else.
    const out = await projection.execute({ requesterUserId: "u1" });
    expect(out[0]!.name).toBeNull();
  });

  /**
   * The fan-out this field would otherwise let a caller scale by hand.
   *
   * Nothing caps how many lists a person may create, so without
   * `MAX_LISTS_WITH_COVERS` the ids handed to the card readers grow with the
   * caller's own list count — and the readers chunk and run those
   * concurrently, each run being several round trips inside the delegated
   * projection. One person making lists could exhaust the connection pool for
   * everybody.
   *
   * These assert on how many ids are *asked for*, because that is what decides
   * how many runs `DelegatedServiceCardReader` fires: at or below
   * `MAX_SERVICE_PAGE` (48) it is exactly one, which `card-readers.test.ts`
   * pins separately.
   */
  describe("when somebody has made a great many lists", () => {
    const listsFor = (count: number): ListRow[] =>
      Array.from({ length: count }, (_, i) => ({
        id: `l${i}`,
        userId: "u1",
        // The oldest is the default, exactly as a real row set is.
        name: i === 0 ? null : `List ${i}`,
        isDefault: i === 0,
        // Strictly increasing, so list 0 is unambiguously the oldest and the
        // repository's newest-first order hands it back last.
        createdAt: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000),
      }));

    const rowsFor = (count: number): FavouriteRow[] =>
      listsFor(count).flatMap((list, i) =>
        Array.from({ length: FAVOURITE_COVER_TILES }, (_, j) => ({
          listId: list.id,
          userId: "u1",
          targetType: "service" as const,
          targetId: `s${i}-${j}`,
          createdAt: at(`2026-03-01T00:00:0${j}.000Z`),
        })),
      );

    function run(count: number) {
      const services = new FakeServiceCards(
        rowsFor(count).map((r) => serviceCard(r.targetId, [`https://cdn/${r.targetId}.jpg`])),
      );
      const entries = new FakeFavouriteRepository(rowsFor(count));
      const projection = new ListMyListsProjection(
        new FakeFavouriteListRepository(listsFor(count)),
        entries,
        services,
        new FakeProviderCards(),
      );
      return { projection, services, entries };
    }

    it("never asks for more cover targets than the bound allows", async () => {
      const { projection, services } = run(40);
      await projection.execute({ requesterUserId: "u1" });
      expect(services.askedIds.length).toBeLessThanOrEqual(
        MAX_LISTS_WITH_COVERS * FAVOURITE_COVER_TILES,
      );
      // 48 is `MAX_SERVICE_PAGE`, so the bound also guarantees a single run.
      expect(services.askedIds.length).toBeLessThanOrEqual(48);
    });

    it("stops growing: two hundred lists cost exactly what forty do", async () => {
      // The property, stated directly. Unbounded, these are 160 and 800.
      const forty = run(40);
      const twoHundred = run(200);
      await forty.projection.execute({ requesterUserId: "u1" });
      await twoHundred.projection.execute({ requesterUserId: "u1" });
      expect(twoHundred.services.askedIds.length).toBe(forty.services.askedIds.length);
      expect(twoHundred.services.calls).toBe(1);
    });

    it("asks the repository to cover only the lists it will draw", async () => {
      // The bound is applied before `coverTargetsFor`, not after it — asking
      // for two hundred lists' tiles and throwing most away would still be the
      // expensive query.
      const { projection, entries } = run(200);
      await projection.execute({ requesterUserId: "u1" });
      expect(entries.coveredListIds.length).toBe(MAX_LISTS_WITH_COVERS);
    });

    it("still returns every list, named and counted, past the bound", async () => {
      // Only the mosaic is dropped. A list that vanished from this answer would
      // be a list the dialog cannot save into.
      const { projection } = run(40);
      const out = await projection.execute({ requesterUserId: "u1" });
      expect(out).toHaveLength(40);
      expect(out.every((l) => l.itemCount === FAVOURITE_COVER_TILES)).toBe(true);
      expect(out[39]!.coverUrls).toEqual([]);
    });

    it("keeps the covers on the lists a reader meets first, starting with the default", async () => {
      const { projection } = run(40);
      const out = await projection.execute({ requesterUserId: "u1" });
      expect(out[0]!.isDefault).toBe(true);
      expect(out[0]!.coverUrls).toHaveLength(FAVOURITE_COVER_TILES);
      expect(out[MAX_LISTS_WITH_COVERS - 1]!.coverUrls).toHaveLength(FAVOURITE_COVER_TILES);
      expect(out[MAX_LISTS_WITH_COVERS]!.coverUrls).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// ListListEntriesProjection
// ---------------------------------------------------------------------------

describe("ListListEntriesProjection", () => {
  const lists: ListRow[] = [
    { id: "mine", userId: "u1", name: null, isDefault: true, createdAt: at("2026-01-01T00:00:00.000Z") },
    { id: "theirs", userId: "u2", name: "Deles", isDefault: false, createdAt: at("2026-01-02T00:00:00.000Z") },
  ];

  // Newest first: the deleted service, then the provider, then the service.
  const rows: FavouriteRow[] = [
    { listId: "mine", userId: "u1", targetType: "service", targetId: "deleted", createdAt: at("2026-03-03T00:00:00.000Z") },
    { listId: "mine", userId: "u1", targetType: "provider", targetId: "p1", createdAt: at("2026-03-02T00:00:00.000Z") },
    { listId: "mine", userId: "u1", targetType: "service", targetId: "s1", createdAt: at("2026-03-01T00:00:00.000Z") },
    { listId: "theirs", userId: "u2", targetType: "service", targetId: "s9", createdAt: at("2026-03-04T00:00:00.000Z") },
  ];

  let entries: FakeFavouriteRepository;
  let services: FakeServiceCards;
  let providers: FakeProviderCards;
  let projection: ListListEntriesProjection;

  beforeEach(() => {
    entries = new FakeFavouriteRepository(rows);
    services = new FakeServiceCards([serviceCard("s1", ["https://cdn/s1.jpg"]), serviceCard("s9")]);
    providers = new FakeProviderCards([providerCard("p1", "https://cdn/p1-logo.jpg")]);
    projection = new ListListEntriesProjection(new FakeFavouriteListRepository(lists), entries, services, providers);
  });

  it("refuses a list that is not the caller's", async () => {
    // Lists are private. Without this, an id is a way to read a stranger's.
    await expect(
      projection.execute({ requesterUserId: "u1", listId: "theirs", limit: 20 }),
    ).rejects.toThrow();
  });

  it("proves ownership before it reads a single entry", async () => {
    // `entriesIn` takes the list id on trust and checks nothing, so the refusal
    // above has to happen *first*. Rejecting after the read would still have
    // read a stranger's rows.
    await expect(
      projection.execute({ requesterUserId: "u1", listId: "theirs", limit: 20 }),
    ).rejects.toThrow();
    expect(entries.limit).toBeUndefined();
    expect(entries.countCalls).toBe(0);
    expect(entries.coverCalls).toBe(0);
  });

  it("refuses a list id that exists for nobody", async () => {
    await expect(
      projection.execute({ requesterUserId: "u1", listId: "no-such-list", limit: 20 }),
    ).rejects.toThrow();
  });

  it("returns both kinds in one run, newest saved first", async () => {
    const out = await projection.execute({ requesterUserId: "u1", listId: "mine", limit: 20 });
    expect(out.items.map((i) => i.kind)).toEqual(["provider", "service"]);
  });

  it("drops an entry whose listing is gone or unpublished", async () => {
    // There is no foreign key, on purpose. This is where that is paid for —
    // and it is the same rule both listings already apply.
    const out = await projection.execute({ requesterUserId: "u1", listId: "mine", limit: 20 });
    expect(out.items.map((i) => (i.kind === "service" ? i.service.id : i.provider.id))).not.toContain("deleted");
  });

  it("still advances the cursor past a dropped row", async () => {
    // The cursor comes from the last row the repository returned, not from the
    // last row that survived — otherwise the dropped row's position is fetched
    // forever.
    const out = await projection.execute({ requesterUserId: "u1", listId: "mine", limit: 1 });
    expect(out.items).toEqual([]);
    expect(out.nextCursor).not.toBeNull();
  });

  it("resolves each listing in the reader's language", async () => {
    await projection.execute({ requesterUserId: "u1", listId: "mine", limit: 20, locale: "pt-MZ" });
    expect(services.askedLocale).toBe("pt-MZ");
    expect(providers.askedLocale).toBe("pt-MZ");
  });

  it("resolves each kind in one call, not one per entry", async () => {
    await projection.execute({ requesterUserId: "u1", listId: "mine", limit: 20 });
    expect(services.calls).toBe(1);
    expect(providers.calls).toBe(1);
  });

  it("asks for no kind that is not on the page", async () => {
    // A page of services must not also fire a providers query that can only
    // come back empty.
    const servicesOnly = new FakeFavouriteRepository([
      { listId: "mine", userId: "u1", targetType: "service", targetId: "s1", createdAt: at("2026-03-01T00:00:00.000Z") },
    ]);
    const p = new FakeProviderCards();
    await new ListListEntriesProjection(
      new FakeFavouriteListRepository(lists),
      servicesOnly,
      services,
      p,
    ).execute({ requesterUserId: "u1", listId: "mine", limit: 20 });
    expect(p.calls).toBe(0);
  });

  it("clamps a limit nobody should be able to ask for", async () => {
    await projection.execute({ requesterUserId: "u1", listId: "mine", limit: 5000 });
    expect(entries.limit).toBeLessThanOrEqual(50);
  });

  it("defaults the page size rather than trusting the caller", async () => {
    // A zod `.default()` does not reach the GraphQL schema — the same reason
    // `ListActivityProjection` clamps here rather than there.
    await projection.execute({ requesterUserId: "u1", listId: "mine" });
    expect(entries.limit).toBe(24);
  });

  it("floors a limit of zero to one rather than asking for nothing", async () => {
    await projection.execute({ requesterUserId: "u1", listId: "mine", limit: 0 });
    expect(entries.limit).toBe(1);
  });

  it("passes the caller's cursor straight through, unparsed", async () => {
    await projection.execute({
      requesterUserId: "u1",
      listId: "mine",
      limit: 20,
      cursor: "2026-03-02T00:00:00.000Z|p1",
    });
    expect(entries.cursor).toBe("2026-03-02T00:00:00.000Z|p1");
  });

  it("carries the list's own header, with the count of everything in it", async () => {
    const out = await projection.execute({ requesterUserId: "u1", listId: "mine", limit: 20 });
    expect(out.list).toMatchObject({ id: "mine", name: null, isDefault: true, itemCount: 3 });
  });

  it("resolves the header's covers in the same two calls as the page", async () => {
    // The cover targets of the first page are its own first four entries, so
    // asking for them separately would be two more queries for ids already in
    // hand.
    const out = await projection.execute({ requesterUserId: "u1", listId: "mine", limit: 20 });
    expect(services.calls).toBe(1);
    expect(providers.calls).toBe(1);
    expect(out.list.coverUrls).toEqual(["https://cdn/p1-logo.jpg", "https://cdn/s1.jpg"]);
  });
});

// ---------------------------------------------------------------------------
// MarkFavouritesProjection
// ---------------------------------------------------------------------------

describe("MarkFavouritesProjection", () => {
  const rows: FavouriteRow[] = [
    { listId: "l1", userId: "u1", targetType: "service", targetId: "a", createdAt: at("2026-03-01T00:00:00.000Z") },
    { listId: "l2", userId: "u1", targetType: "service", targetId: "a", createdAt: at("2026-03-02T00:00:00.000Z") },
    { listId: "l3", userId: "u1", targetType: "service", targetId: "a", createdAt: at("2026-03-03T00:00:00.000Z") },
    { listId: "l1", userId: "u1", targetType: "service", targetId: "c", createdAt: at("2026-03-04T00:00:00.000Z") },
    { listId: "l1", userId: "u2", targetType: "service", targetId: "b", createdAt: at("2026-03-05T00:00:00.000Z") },
    { listId: "l1", userId: "u1", targetType: "provider", targetId: "b", createdAt: at("2026-03-06T00:00:00.000Z") },
  ];

  let entries: FakeFavouriteRepository;
  let projection: MarkFavouritesProjection;

  beforeEach(() => {
    entries = new FakeFavouriteRepository(rows);
    projection = new MarkFavouritesProjection(entries);
  });

  it("returns only the ids this person saved", async () => {
    expect(
      await projection.execute({ requesterUserId: "u1", targetType: "service", targetIds: ["a", "b", "c"] }),
    ).toEqual(["a", "c"]);
  });

  it("answers an empty page without touching the database", async () => {
    expect(await projection.execute({ requesterUserId: "u1", targetType: "service", targetIds: [] })).toEqual([]);
    expect(entries.marked).toBeUndefined();
  });

  it("returns an id once even when it is in three lists", async () => {
    // The heart is "saved anywhere", not "saved three times".
    expect(await projection.execute({ requesterUserId: "u1", targetType: "service", targetIds: ["a"] })).toEqual(["a"]);
  });

  it("asks only about the ids on screen", async () => {
    // Never "everything you ever saved" — a reader with two thousand
    // favourites must not ship two thousand ids to draw twenty-four hearts.
    await projection.execute({ requesterUserId: "u1", targetType: "service", targetIds: ["a", "b"] });
    expect(entries.marked).toEqual({ userId: "u1", targetType: "service", targetIds: ["a", "b"] });
  });

  it("keeps the two kinds apart", async () => {
    // `b` is saved as a provider, not as a service. A heart on a service card
    // for `b` would be a lie.
    expect(await projection.execute({ requesterUserId: "u1", targetType: "provider", targetIds: ["b"] })).toEqual(["b"]);
    expect(await projection.execute({ requesterUserId: "u1", targetType: "service", targetIds: ["b"] })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ListsForTargetProjection
// ---------------------------------------------------------------------------

describe("ListsForTargetProjection", () => {
  const rows: FavouriteRow[] = [
    { listId: "l1", userId: "u1", targetType: "service", targetId: "a", createdAt: at("2026-03-01T00:00:00.000Z") },
    { listId: "l2", userId: "u1", targetType: "service", targetId: "a", createdAt: at("2026-03-02T00:00:00.000Z") },
    { listId: "l9", userId: "u2", targetType: "service", targetId: "a", createdAt: at("2026-03-03T00:00:00.000Z") },
  ];

  it("returns every one of the caller's lists that holds the listing", async () => {
    const out = await new ListsForTargetProjection(new FakeFavouriteRepository(rows)).execute({
      requesterUserId: "u1",
      targetType: "service",
      targetId: "a",
    });
    expect(out.sort()).toEqual(["l1", "l2"]);
  });

  it("never names somebody else's list", async () => {
    // The dialog ticks these rows. A stranger's list id in the answer is a
    // stranger's list id in the client's cache.
    const out = await new ListsForTargetProjection(new FakeFavouriteRepository(rows)).execute({
      requesterUserId: "u1",
      targetType: "service",
      targetId: "a",
    });
    expect(out).not.toContain("l9");
  });

  it("returns nothing for a listing that is in no list", async () => {
    const out = await new ListsForTargetProjection(new FakeFavouriteRepository(rows)).execute({
      requesterUserId: "u1",
      targetType: "service",
      targetId: "never-saved",
    });
    expect(out).toEqual([]);
  });
});
