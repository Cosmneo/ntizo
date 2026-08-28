import { describe, expect, it } from "bun:test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import { service } from "../../../shared/infrastructure/database/catalog/schemas";
import {
  coerceReviewAggregate,
  conditionsFor,
  orderByFor,
  reviewAggregate,
  verifiedAggregate,
} from "../infrastructure/repositories/drizzle/service-read.repository";

/**
 * `orderByFor`'s generated SQL, not a live database.
 *
 * `postgres()` connects lazily — building this client and calling `.toSQL()`
 * on a query never opens a socket, so this asserts the SQL text the same way
 * a real Postgres would receive it without the cost or flakiness of one.
 */
const db = drizzle(postgres("postgres://user:pass@localhost:5999/nonexistent", { prepare: false, max: 1 }));

describe("orderByFor", () => {
  it("sorts by price with an explicit nulls last, not a default it happens to share", () => {
    // ASC already defaults to NULLS LAST — this assertion is not guarding
    // against Postgres's default, it is guarding against the clause being
    // "simplified" away. DESC defaults the other way, to NULLS FIRST, so a
    // later "most expensive first" order built by flipping this to desc()
    // would silently move every quote service — the ones with no price at
    // all — to the top, and nothing would fail to say so. `nulls last`
    // spelled out here is what a direction change has to touch.
    const { sql } = db.select().from(service).orderBy(...orderByFor("price")).toSQL();
    expect(sql.toLowerCase()).toContain("nulls last");
  });

  it("orders newest first without touching price", () => {
    const { sql } = db.select().from(service).orderBy(...orderByFor("newest")).toSQL();
    expect(sql.toLowerCase()).not.toContain("nulls last");
    expect(sql.toLowerCase()).toContain("created_at");
  });

  it("falls back to the provider's own arrangement for `default` and no sort at all", () => {
    for (const sort of ["default", undefined] as const) {
      const { sql } = db.select().from(service).orderBy(...orderByFor(sort)).toSQL();
      expect(sql.toLowerCase()).toContain("sort_order");
    }
  });
});

describe("conditionsFor — city", () => {
  it("never hides a remote service behind a city filter", () => {
    // A remote service has no geography at all. Excluding it from "Maputo"
    // silently removes every online listing from a filter the reader thinks
    // narrows by where the *work* happens.
    const { sql } = db
      .select()
      .from(service)
      .where(and(...conditionsFor(db as never, { city: "Maputo" })))
      .toSQL();
    expect(sql).toContain("location_type");
    expect(sql.toLowerCase()).toContain("or");
  });
});

/**
 * `avg()` and `count(*)` never reach the database in this file — see the
 * module comment on `db` above — so this is the seam that proves the string
 * Postgres actually returns becomes a number before it reaches
 * `serviceReadModel`, without needing a live one.
 */
describe("coerceReviewAggregate", () => {
  it("turns the string avg() returns into a rounded number", () => {
    // Full precision, the way `avg()` over an integer 1–5 column actually
    // comes back — not the pre-rounded "4.7" a hand-written fixture might use.
    expect(
      coerceReviewAggregate({ providerRatingAverage: "4.666666666666667", providerReviewCount: 6 }),
    ).toEqual({ providerRatingAverage: 4.7, providerReviewCount: 6 });
  });

  it("keeps a count that arrives as postgres-js's own string", () => {
    expect(
      coerceReviewAggregate({ providerRatingAverage: "4", providerReviewCount: "6" }),
    ).toEqual({ providerRatingAverage: 4, providerReviewCount: 6 });
  });

  it("a null average stays null, whatever the count", () => {
    // Never zero: zero is a score a person could have given, and this is the
    // one function standing between the database and that mistake.
    expect(
      coerceReviewAggregate({ providerRatingAverage: null, providerReviewCount: 0 }),
    ).toEqual({ providerRatingAverage: null, providerReviewCount: 0 });
  });

  it("treats a missing average the same as a null one", () => {
    // `undefined` reaches this function only from a hand-built object (a
    // test, a future caller) — Postgres itself never omits a selected
    // column — but the fallback must not crash on one either.
    expect(
      coerceReviewAggregate({ providerRatingAverage: undefined, providerReviewCount: 0 }),
    ).toEqual({ providerRatingAverage: null, providerReviewCount: 0 });
  });

  it("a zero count does not turn a real average into null, or the reverse", () => {
    // The two fields are coerced independently, each on its own null check —
    // neither infers its value from the other's. A zero count next to a real
    // average must not be "corrected" into null, and a null average next to
    // a nonzero count must not be "corrected" into zero; either guess would
    // be this function inventing a fact instead of relaying one.
    expect(
      coerceReviewAggregate({ providerRatingAverage: "4.5", providerReviewCount: 0 }),
    ).toEqual({ providerRatingAverage: 4.5, providerReviewCount: 0 });
    expect(
      coerceReviewAggregate({ providerRatingAverage: null, providerReviewCount: 3 }),
    ).toEqual({ providerRatingAverage: null, providerReviewCount: 3 });
  });
});

/**
 * The construct that stops a provider with several rows on the other side of
 * a join — several accepted documents, several reviews — from multiplying
 * its service rows, for each of `listPublished`'s two provider aggregates.
 *
 * Both hold "one row per provider" by construction (`SELECT DISTINCT` on one
 * column; `GROUP BY` under an aggregate), and both held it with no test to
 * say so — the exact shape of fact a later tidy-up deletes without noticing,
 * since dropping either changes nothing observable until a provider actually
 * accumulates a second accepted document or a second review. The DB-
 * integration suite doesn't seed `provider_document` either, so nothing
 * downstream would have caught it. `.toSQL()` against a lazily-connecting
 * client, the same seam `orderByFor`/`conditionsFor` use above, so this pins
 * the clause without a live database.
 */
describe("listPublished's provider aggregates never multiply a service row", () => {
  it("caps the verified join at one row per provider with SELECT DISTINCT", () => {
    const verifiedAgg = verifiedAggregate(db as never);
    const { sql } = db
      .select({ id: service.id })
      .from(service)
      .leftJoin(verifiedAgg, eq(verifiedAgg.providerId, service.providerId))
      .toSQL();
    expect(sql.toLowerCase()).toContain("select distinct");
  });

  it("caps the review join at one row per provider with GROUP BY", () => {
    const reviewAgg = reviewAggregate(db as never);
    const { sql } = db
      .select({ id: service.id })
      .from(service)
      .leftJoin(reviewAgg, eq(reviewAgg.providerId, service.providerId))
      .toSQL();
    expect(sql.toLowerCase()).toContain("group by");
  });
});
