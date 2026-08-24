import { describe, expect, it } from "vitest";
import {
  PROVIDER_TYPES,
  ProviderType,
  providerTypeSchema,
} from "../provider-type.enum";

/**
 * The zod tuple is written out by hand so the GraphQL generator can read it,
 * which means it is a second copy of the same list. This is what stops the two
 * from disagreeing: a third provider type added to the enum and forgotten in
 * the tuple would silently make the browse's filter unable to ask for it, and
 * a query asking for it would be rejected as an invalid argument.
 */
describe("providerTypeSchema", () => {
  it("accepts exactly the types the enum declares", () => {
    expect([...providerTypeSchema.options].sort()).toEqual(
      [...PROVIDER_TYPES].sort(),
    );
  });

  it("accepts each type by name", () => {
    for (const type of PROVIDER_TYPES) {
      expect(providerTypeSchema.parse(type)).toBe(type);
    }
  });

  it("refuses anything else", () => {
    expect(providerTypeSchema.safeParse("freelancer").success).toBe(false);
    expect(providerTypeSchema.safeParse("").success).toBe(false);
  });

  it("keeps the enum members and the wire values in step", () => {
    // The values are what reach the database and the URL; renaming a member
    // without renaming its value would break both silently.
    expect(ProviderType.Individual).toBe("individual");
    expect(ProviderType.Organization).toBe("organization");
  });
});
