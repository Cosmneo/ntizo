import { describe, expect, it } from "bun:test";
import { readSchema } from "../read/schema";
import { writeSchema } from "../write/schema";

/**
 * Walks a schema definition and collects every leaf field.
 *
 * Shapes verified against the 1.0.0-beta.3 types:
 *   GraphQLSchemaDefinition = { fields, defaults?, _isGraphQLSchema: true }
 *   GraphQLFieldDefinition  = { operation, input, output, docs, _isGraphQLField: true }
 * Leaves are identified by the `_isGraphQLField` marker rather than by duck-typing
 * on `operation`, so a nested group can never be mistaken for a field.
 */
function collectFields(
  node: unknown,
  path: string[] = [],
): Array<{ path: string; operation: unknown }> {
  if (!node || typeof node !== "object") return [];

  if ((node as { _isGraphQLField?: true })._isGraphQLField) {
    return [{ path: path.join("."), operation: (node as { operation: unknown }).operation }];
  }
  // Unwrap a nested schema definition, then recurse over its groups.
  const groups = (node as { _isGraphQLSchema?: true })._isGraphQLSchema
    ? (node as { fields: Record<string, unknown> }).fields
    : (node as Record<string, unknown>);

  return Object.entries(groups).flatMap(([k, v]) => collectFields(v, [...path, k]));
}

describe("tier segregation", () => {
  it("read/ exposes queries only", () => {
    const fields = collectFields(readSchema);
    expect(fields.length).toBeGreaterThan(0);
    const offenders = fields.filter((f) => f.operation !== "query");
    expect(offenders.map((o) => o.path)).toEqual([]);
  });

  it("write/ exposes mutations only", () => {
    const fields = collectFields(writeSchema);
    expect(fields.length).toBeGreaterThan(0);
    const offenders = fields.filter((f) => f.operation !== "mutation");
    expect(offenders.map((o) => o.path)).toEqual([]);
  });
});
