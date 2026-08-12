import { describe, expect, it } from "bun:test";
import type { InferFieldInput } from "@cosmneo/onion-lasagna/graphql/field";
import { createCatalogWriteHandlers } from "../graphql/handlers/mutations.handlers";
import { setServiceTranslation } from "../graphql/schema/mutations";

const noop = { async execute() { return { ok: true as const }; } } as never;

describe("createCatalogWriteHandlers", () => {
  it("builds a handler for every catalogue mutation", () => {
    const handlers = createCatalogWriteHandlers({
      catalog: {
        useCases: {
          createCategory: noop,
          updateCategory: noop,
          reorderCategories: noop,
          createService: noop,
          updateService: noop,
          manageOptions: {
            add: async () => ({ optionId: "x" }),
            update: async () => ({ ok: true as const }),
            remove: async () => ({ ok: true as const }),
            reorder: async () => ({ ok: true as const }),
          },
          setServiceStatus: noop,
          setServiceTranslation: noop,
          setServiceMembers: noop,
        },
      },
    } as never);

    // Three category mutations plus nine service ones. Asserting the count
    // rather than "not empty" is what catches a field dropped from the schema:
    // an unhandled field collapses the builder's return type to `never`, but a
    // handled field removed from the schema fails silently.
    expect(handlers.length).toBe(12);
  });
});

/**
 * Type-only checks. `bun test` strips types rather than checking them, so
 * these two `const`s are never asserted against at runtime — `bun run
 * check-types` is what enforces them. They exist to catch the regression
 * code review found: `description` drifting back to `.optional()`, which
 * would let a rename-only call silently discard a saved description with
 * nothing in the type system to stop it.
 */
type SetServiceTranslationInput = InferFieldInput<typeof setServiceTranslation>;

// A rename-only call — no `description` at all — must not compile. If this
// stops erroring, `description` regressed to optional.
// @ts-expect-error - `description` is required (nullable, not optional)
const _renameOnlyOmitsDescription: SetServiceTranslationInput = {
  serviceId: "s1",
  locale: "pt-MZ",
  name: "New name",
};

// Saying "there is none" explicitly is how a caller now has to state that
// intent; this must compile without the `@ts-expect-error` above.
const _renameOnlyStatesNoDescription: SetServiceTranslationInput = {
  serviceId: "s1",
  locale: "pt-MZ",
  name: "New name",
  description: null,
};
