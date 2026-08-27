import { describe, expect, it } from "bun:test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { service } from "../../../shared/infrastructure/database/catalog/schemas";
import { orderByFor } from "../infrastructure/repositories/drizzle/service-read.repository";

/**
 * `orderByFor`'s generated SQL, not a live database.
 *
 * `postgres()` connects lazily — building this client and calling `.toSQL()`
 * on a query never opens a socket, so this asserts the SQL text the same way
 * a real Postgres would receive it without the cost or flakiness of one.
 */
const db = drizzle(postgres("postgres://user:pass@localhost:5999/nonexistent", { prepare: false, max: 1 }));

describe("orderByFor", () => {
  it("sorts by price with nulls last, so a quote service does not read as free", () => {
    // Postgres sorts nulls FIRST under ASC by default, which would put every
    // quote service — the ones with no price at all — at the top of
    // "cheapest first". `nulls last` is the one thing this test exists to
    // guard.
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
