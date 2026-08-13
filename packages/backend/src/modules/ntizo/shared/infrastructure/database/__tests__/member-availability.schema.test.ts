import { describe, expect, test } from "bun:test";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { memberAvailability } from "../scheduling/schemas/member-availability.schema";

// `Check#value` is an `SQL` chunk tree, not a string — its chunks are
// `StringChunk`/`Param` objects with no `toString`, so naive stringifying
// prints `[object Object]`. `PgDialect` is the renderer drizzle-kit itself
// uses to turn that tree into real SQL text, so rendering through it (rather
// than reaching into chunk internals) asserts against the same text that
// ends up in the migration.
const dialect = new PgDialect();

describe("member_availability shape columns", () => {
  const { columns, checks } = getTableConfig(memberAvailability);
  const byName = new Map(columns.map((c) => [c.name, c]));

  test("carries the three shape columns", () => {
    for (const name of ["buffer_minutes", "slot_interval_minutes", "capacity"]) {
      expect(byName.has(name)).toBe(true);
    }
  });

  test("all three are nullable, because null means 'use the default'", () => {
    // Not-null with a default would make "nothing said" and "said the
    // default's own number" indistinguishable, and the day the default
    // changes every untouched rule would silently keep the old one.
    for (const name of ["buffer_minutes", "slot_interval_minutes", "capacity"]) {
      expect(byName.get(name)!.notNull).toBe(false);
    }
  });

  test("the grid check admits zero — 'open, no slots'", () => {
    const grid = checks.find((c) => c.name === "member_availability_slot_interval");
    expect(grid).toBeDefined();
    expect(dialect.sqlToQuery(grid!.value).sql).toContain("0");
  });

  test("capacity refuses zero and below", () => {
    const cap = checks.find((c) => c.name === "member_availability_capacity");
    expect(cap).toBeDefined();
  });
});
