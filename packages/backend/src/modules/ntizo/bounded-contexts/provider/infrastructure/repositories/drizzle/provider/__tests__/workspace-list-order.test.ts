import { describe, expect, it } from "bun:test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { provider as providerTable } from "../../../../../../../shared/infrastructure/database/provider";
import { workspaceListOrder } from "../drizzle-provider.repository";

/**
 * The generated SQL, not a live database.
 *
 * `postgres()` connects lazily — building this client and calling `.toSQL()`
 * never opens a socket. The same technique `service-read.repository.test.ts`
 * uses, and for the same reason: the clause under test is a string Postgres
 * would receive, and asserting on it costs neither a container nor a flake.
 */
const db = drizzle(
  postgres("postgres://user:pass@localhost:5999/nonexistent", { prepare: false, max: 1 }),
);

/**
 * The ORDER BY alone, cut out of the statement around it.
 *
 * Asserting on the whole `.toSQL()` text would be vacuous here: drizzle names
 * every selected column in the SELECT list, so `status` and `created_at` are
 * already in the string before any ordering is built. Cutting at the keyword
 * leaves only the clause — and a clause that is not emitted at all throws
 * rather than passing on the SELECT list's own words, which is exactly the
 * shape this regression took.
 */
function orderByOf(sql: string): string {
  const at = sql.toLowerCase().indexOf("order by");
  if (at === -1) throw new Error(`no \`order by\` in: ${sql}`);
  return sql.toLowerCase().slice(at);
}

describe("workspaceListOrder", () => {
  it("puts the workspaces the platform has approved first", () => {
    // The bug: `findListItemsForUser` had no ORDER BY at all, so Postgres
    // returned the rows in whatever order it liked and `useActiveProvider`'s
    // `providers[0]` fallback picked one at random. An owner holding an
    // active workspace and a pending duplicate could be dropped into the
    // pending one — where everything they publish is filtered out of the
    // storefront, with nothing saying so.
    const { sql } = db.select().from(providerTable).orderBy(...workspaceListOrder()).toSQL();
    const orderBy = orderByOf(sql);
    expect(orderBy).toContain("'active'");
    expect(orderBy).toContain("desc");
  });

  it("breaks the tie on age, so the order never moves between requests", () => {
    // Two active workspaces must come back in the same order every time.
    // Without a second key the first one is still arbitrary among equals,
    // which is the same bug in a smaller box.
    const { sql } = db.select().from(providerTable).orderBy(...workspaceListOrder()).toSQL();
    expect(orderByOf(sql)).toContain("created_at");
  });
});
