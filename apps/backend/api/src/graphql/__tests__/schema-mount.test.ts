import { describe, expect, it } from "bun:test";
import { privateGraphqlSchema } from "@ntizo/backend/modules/ntizo/graphql/private-schema";
import { buildPrivateGraphQLFields } from "../private";

/**
 * Walks a schema definition and collects every leaf field's dot-joined path
 * — the same path format the field kit itself uses as a handler's `key`
 * (`graphqlRoutes(...).build()` walks the identical `_isGraphQLSchema` /
 * `_isGraphQLField` shape internally to derive it). Copied rather than
 * imported from `packages/backend`'s identical helper in
 * `modules/ntizo/__tests__/fitness-tier-segregation.test.ts`: this app must
 * not import a test file out of another package, and six lines isn't worth
 * turning into a shared export.
 */
function collectFieldPaths(node: unknown, path: string[] = []): string[] {
  if (!node || typeof node !== "object") return [];
  if ((node as { _isGraphQLField?: true })._isGraphQLField) {
    return [path.join(".")];
  }
  const groups = (node as { _isGraphQLSchema?: true })._isGraphQLSchema
    ? (node as { fields: Record<string, unknown> }).fields
    : (node as Record<string, unknown>);
  return Object.entries(groups).flatMap(([k, v]) => collectFieldPaths(v, [...path, k]));
}

/**
 * `buildPrivateGraphQLFields()` and `privateGraphqlSchema` are two
 * independently-maintained lists — one hand-assembled in this file's
 * sibling (`../private.ts`, the `fields: [...createXHandlers(...), ...]`
 * array `getYoga` passes to `buildYoga`), the other merged in
 * `packages/backend/.../read/schema.ts` and `write/schema.ts` and re-merged
 * into `privateGraphqlSchema`. Nothing forces them to agree.
 *
 * A field present in the schema but absent from the handler array boots
 * clean and resolves to `null` with no error at request time — no failed
 * build, no thrown exception, nothing an operator would notice short of a
 * user reporting a feature that silently does nothing. That is exactly how
 * eight notification handlers shipped mounted-nowhere in an earlier phase of
 * this project, with every existing test green. The opposite direction (a
 * handler for a key the schema never declares) is not silent — the kit
 * throws at yoga-build time (`defined in resolvers, but not in schema`) the
 * first time `getYoga` actually runs — but it is still asserted here, so a
 * rename on either side shows up as an exact diff instead of depending on
 * that boot-time throw ever being exercised by a test.
 */
describe("every field privateGraphqlSchema declares has a mounted handler", () => {
  it("the declared field paths and the mounted handler keys are the same set", () => {
    const declared = collectFieldPaths(privateGraphqlSchema).sort();
    const { fields } = buildPrivateGraphQLFields();
    const mounted = fields.map((f) => f.key).sort();

    expect(declared.length).toBeGreaterThan(0);
    expect(declared).toEqual(mounted);
  });

  it("activity.mine specifically is declared and mounted — the field this task added", () => {
    const declared = collectFieldPaths(privateGraphqlSchema);
    const { fields } = buildPrivateGraphQLFields();
    const mounted = fields.map((f) => f.key);

    expect(declared).toContain("activity.mine");
    expect(mounted).toContain("activity.mine");
  });
});
