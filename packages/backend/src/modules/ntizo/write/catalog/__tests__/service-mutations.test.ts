import { describe, expect, it } from "bun:test";
import { createCatalogWriteHandlers } from "../graphql/handlers/mutations.handlers";

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
        },
      },
    } as never);

    // Three category mutations plus eight service ones. Asserting the count
    // rather than "not empty" is what catches a field dropped from the schema:
    // an unhandled field collapses the builder's return type to `never`, but a
    // handled field removed from the schema fails silently.
    expect(handlers.length).toBe(11);
  });
});
