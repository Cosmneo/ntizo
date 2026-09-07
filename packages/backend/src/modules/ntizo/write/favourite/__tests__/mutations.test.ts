import { describe, expect, it } from "bun:test";
import { collectFields, type GraphQLFieldDefinition } from "@cosmneo/onion-lasagna/graphql/field";
import { ForbiddenError } from "@cosmneo/onion-lasagna";
import type { NtizoGraphqlContext } from "../../../graphql/context";
import type { FavouriteBootstrap } from "../../../bounded-contexts/favourite/bootstrap";
import {
  createFavouriteWriteHandlers,
  type FavouriteWriteModule,
} from "../graphql/handlers/mutations.handlers";
import { favouriteWriteSchema } from "../graphql/schema/mutations";

const anonymousCtx: NtizoGraphqlContext = {
  requesterUserId: null,
  email: null,
  firstName: null,
  lastName: null,
  role: "customer",
  requestId: null,
  ipAddress: null,
  userAgent: null,
};

/**
 * None of the five is expected to run in this file — every test here proves
 * a refusal that has to happen before any use case is touched.
 */
function refusingUseCase() {
  return {
    execute: async () => {
      throw new Error("not reachable — requireUser must refuse first");
    },
  };
}

function makeModule(): FavouriteWriteModule {
  return {
    favourite: {
      repositories: {} as never,
      useCases: {
        quickSave: refusingUseCase(),
        setLists: refusingUseCase(),
        createList: refusingUseCase(),
        renameList: refusingUseCase(),
        removeList: refusingUseCase(),
      },
    } as unknown as FavouriteBootstrap,
  };
}

const handlers = createFavouriteWriteHandlers(makeModule());

/**
 * The schema's leaves, not a hand-maintained list of field names — so a
 * sixth mutation added later to `favouriteWriteSchema` is covered by both
 * tests below without anybody remembering to come back and add it here.
 */
function leafFields(): { key: string; field: GraphQLFieldDefinition }[] {
  return collectFields(favouriteWriteSchema.fields);
}

/** The mounted handler for one schema leaf. */
function handlerFor(entry: { key: string }): (args: unknown, ctx: unknown) => Promise<unknown> {
  const found = handlers.find((h) => h.key === entry.key);
  if (!found) throw new Error(`no handler mounted for ${entry.key}`);
  return found.handler;
}

/**
 * The published input JSON Schema — the surface a client is actually held
 * to — rather than a reach into zod internals. Same accessor
 * `write/booking`'s equivalent test argues for.
 */
function jsonSchemaOf(entry: { field: GraphQLFieldDefinition }): JsonSchemaLike {
  const schema = entry.field.input as { toJsonSchema(): unknown } | undefined;
  if (!schema) throw new Error("the field declares no input");
  return schema.toJsonSchema() as JsonSchemaLike;
}

function inputShapeOf(entry: { field: GraphQLFieldDefinition }): Record<string, unknown> {
  return jsonSchemaOf(entry).properties ?? {};
}

interface JsonSchemaLike {
  readonly type?: string;
  readonly enum?: readonly unknown[];
  readonly minLength?: number;
  readonly minItems?: number;
  readonly minimum?: number;
  readonly items?: JsonSchemaLike;
  readonly properties?: Readonly<Record<string, JsonSchemaLike>>;
  readonly required?: readonly string[];
}

/**
 * The smallest value that satisfies a JSON Schema leaf — built from the
 * schema itself, not a hand-maintained sample per field. The kit validates
 * input before a built handler ever reaches `requireUser(ctx)` (see
 * `createFieldHandler` in the field kit), so a garbage or empty payload
 * would refuse as `ObjectValidationError` before the anonymous check below
 * ever runs, proving nothing about it. This is what lets the "refuses an
 * anonymous caller" test stay a pure schema walk: a sixth mutation's
 * required shape is satisfiable the moment its schema exists, without
 * anybody adding a matching fixture here.
 */
function stubFor(schema: JsonSchemaLike): unknown {
  if (schema.enum && schema.enum.length > 0) return schema.enum[0];
  switch (schema.type) {
    case "string":
      return "x".repeat(Math.max(1, schema.minLength ?? 1));
    case "array": {
      const length = schema.minItems ?? 0;
      return Array.from({ length }, () => (schema.items ? stubFor(schema.items) : null));
    }
    case "number":
    case "integer":
      return schema.minimum ?? 0;
    case "boolean":
      return false;
    case "object": {
      const obj: Record<string, unknown> = {};
      for (const key of schema.required ?? []) {
        obj[key] = stubFor((schema.properties ?? {})[key] ?? {});
      }
      return obj;
    }
    default:
      return null;
  }
}

function validInputFor(entry: { field: GraphQLFieldDefinition }): Record<string, unknown> {
  return stubFor(jsonSchemaOf(entry)) as Record<string, unknown>;
}

describe("favourite write handlers", () => {
  it("refuses an anonymous caller on every field", () => {
    // Five fields, five chances to forget. The test enumerates them from the
    // schema rather than listing them, so a sixth added later is covered
    // without anybody remembering this file. Each is driven with a minimally
    // valid input (see `stubFor`'s doc comment) so the refusal proven here is
    // `requireUser`'s, not the kit's own input validation.
    for (const field of leafFields()) {
      expect(() => handlerFor(field)(validInputFor(field), anonymousCtx)).toThrow(ForbiddenError);
    }
  });

  it("declares no user id on any input", () => {
    // Identity comes from the session. An argument naming a person is a way to
    // act as them.
    for (const field of leafFields()) {
      expect(Object.keys(inputShapeOf(field))).not.toContain("userId");
    }
  });
});
