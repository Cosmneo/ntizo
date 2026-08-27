import { describe, expect, it } from "bun:test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and } from "drizzle-orm";
import { service } from "../../../shared/infrastructure/database/catalog/schemas";
import { conditionsFor, orderByFor } from "../infrastructure/repositories/drizzle/service-read.repository";

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
