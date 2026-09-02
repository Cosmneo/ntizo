import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import postgres from "postgres";
import { DEV_DB_COLD_START_TIMEOUT_MS } from "./dev-db-test-connection";

/**
 * Why a raw `sql<string[]>` aggregate may not use `array_agg` in this codebase.
 *
 * `connection.ts` builds its client with `fetch_types: false`, on Cloudflare's
 * guidance — the type catalogue is a round trip a Worker should not pay on
 * every cold isolate. The cost is that postgres-js cannot resolve an array OID
 * and hands back the value's raw Postgres literal instead: the string
 * `"{at_customer}"`, not `["at_customer"]`.
 *
 * A *declared* array column survives that, because Drizzle converts it by the
 * schema's own type (`text("photo_keys").array()`), which is why `photoUrls`
 * has always worked. A bare `sql<string[]>` expression has no type for Drizzle
 * to convert by, so nothing converts it and the annotation becomes a promise
 * only TypeScript believes.
 *
 * That is not hypothetical. `provider.bySlug` shipped with
 * `array_agg(distinct location_type)` behind exactly such an annotation. Every
 * unit test passed — each one handed `toDTO` a real array by hand — and the
 * endpoint answered INTERNAL_ERROR against the live database with
 * "expected array, received string". The whole detail page was down and no
 * test in the repository could see it, because no test executed SQL.
 *
 * So this file does not test the provider projection. It pins the driver
 * behaviour underneath it, which is the thing that was actually surprising:
 * under the options production really uses, `array_agg` is a string and
 * `json_agg` is an array. Anyone who reaches for `array_agg` in a raw
 * expression again should find this test explaining why not.
 *
 * It opens its own connection rather than using `openDevDbConnection`, and
 * that is the entire point: the helper omits `fetch_types: false`, so a test
 * written on it reproduces nothing and passes against the bug.
 */
describe("raw aggregate array parsing, under production driver options", () => {
  let sql: postgres.Sql;

  beforeAll(() => {
    const url = process.env["DEV_DB_URL"];
    if (!url) {
      throw new Error(
        "DEV_DB_URL is not set. This test asserts against the real dev database " +
          "— set it (see packages/backend/.env) and try again.",
      );
    }
    sql = postgres(url, {
      max: 1,
      connect_timeout: 35,
      // The two that matter, copied from `connection.ts`. Without the first,
      // this test passes against the defect it exists to catch.
      fetch_types: false,
      prepare: false,
    });
  });

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  it(
    "hands back array_agg as its raw Postgres literal, not an array",
    async () => {
      const [row] = await sql`select array_agg(v) as agg from (values ('a'), ('b')) t(v)`;

      expect(typeof row?.["agg"]).toBe("string");
      expect(Array.isArray(row?.["agg"])).toBe(false);
    },
    DEV_DB_COLD_START_TIMEOUT_MS,
  );

  it(
    "hands back json_agg as a real array",
    async () => {
      const [row] = await sql`select json_agg(v) as agg from (values ('a'), ('b')) t(v)`;

      expect(Array.isArray(row?.["agg"])).toBe(true);
      expect(row?.["agg"]).toEqual(["a", "b"]);
    },
    DEV_DB_COLD_START_TIMEOUT_MS,
  );

  it(
    "keeps json_agg an array through a grouped subquery and a left join",
    async () => {
      // The repository's real shape: the aggregate lives in a subquery that is
      // then joined, not in the outermost select. Asserted separately because
      // "it works at the top level" is what made the original bug look fine.
      const [row] = await sql`
        select agg.types
        from (values (1)) p(id)
        left join (
          select 1 as id, json_agg(distinct v) as types
          from (values ('at_customer'), ('remote'), ('at_customer')) t(v)
        ) agg on agg.id = p.id
      `;

      expect(Array.isArray(row?.["types"])).toBe(true);
      expect([...(row?.["types"] as string[])].sort()).toEqual(["at_customer", "remote"]);
    },
    DEV_DB_COLD_START_TIMEOUT_MS,
  );
});
