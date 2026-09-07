import { describe, expect, it } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { favourite, favouriteList } from "../favourite/schemas";

const names = (cols: readonly { name: string }[]) => cols.map((c) => c.name).join(",");

describe("favourite_list", () => {
  it("lives in its own named schema", () => {
    expect(getTableConfig(favouriteList).schema).toBe("ntizo_favourite");
  });

  it("lets exactly one list per person be the default", () => {
    // Two defaults and the heart has two destinations; zero and it has none.
    // A partial unique index is the only thing that makes this true under
    // concurrency — two tabs both creating a first list would otherwise both
    // succeed.
    const uniques = getTableConfig(favouriteList).uniqueConstraints;
    const indexes = getTableConfig(favouriteList).indexes;
    const hasPartial =
      indexes.some((i) => i.config.unique && i.config.where !== undefined) ||
      uniques.some((u) => names(u.columns) === "user_id");
    expect(hasPartial).toBe(true);
  });

  it("refuses two lists with the same name for one person", () => {
    // Two lists called "Casa nova" are unusable: the dialog shows them as
    // identical rows and nobody can tell which one they ticked.
    const indexes = getTableConfig(favouriteList).indexes;
    expect(indexes.some((i) => i.config.unique && names(i.config.columns as never) !== "user_id")).toBe(true);
  });

  it("carries a unique on (id, user_id) that looks redundant and is not", () => {
    // A primary key on `id` alone cannot be the target of the composite
    // foreign key `favourite` needs. This is what makes the denormalised
    // owner on the hot read impossible to get wrong.
    const uniques = getTableConfig(favouriteList).uniqueConstraints;
    expect(uniques.some((u) => names(u.columns) === "id,user_id")).toBe(true);
  });
});

describe("favourite", () => {
  it("keys its owner to its list's owner, not merely alongside it", () => {
    // The composite FK is the whole reason `user_id` may be denormalised
    // here. Without it these are two sources of truth that will one day
    // disagree, and the disagreement is a person seeing somebody else's
    // saved listing.
    const fks = getTableConfig(favourite).foreignKeys;
    expect(fks).toHaveLength(1);
    const ref = fks[0]!.reference();
    expect(names(ref.columns)).toBe("list_id,user_id");
    expect(names(ref.foreignColumns)).toBe("id,user_id");
  });

  it("cannot hold the same listing twice in one list", () => {
    // Without it a double-tap writes two rows and the count is wrong forever.
    const uniques = getTableConfig(favourite).uniqueConstraints;
    expect(uniques.some((u) => names(u.columns) === "list_id,target_type,target_id")).toBe(true);
  });

  it("can hold the same listing in two different lists", () => {
    // "Casa nova" and "Urgente" are both true about one electrician. The
    // unique is scoped to the list, never to the person.
    const uniques = getTableConfig(favourite).uniqueConstraints;
    expect(uniques.some((u) => names(u.columns) === "user_id,target_type,target_id")).toBe(false);
  });

  it("indexes the hearts query", () => {
    // "Which of these 24 listings has this person saved anywhere" runs on
    // every render of a listing page for a signed-in reader.
    const indexes = getTableConfig(favourite).indexes;
    expect(indexes.some((i) => names(i.config.columns as never) === "user_id,target_type,target_id")).toBe(true);
  });

  it("holds no foreign key to what was favourited", () => {
    // The two targets live in different bounded contexts. The one FK above
    // points inside this schema, not out of it.
    const fks = getTableConfig(favourite).foreignKeys;
    expect(fks.every((f) => f.reference().foreignTable === favouriteList)).toBe(true);
  });
});
