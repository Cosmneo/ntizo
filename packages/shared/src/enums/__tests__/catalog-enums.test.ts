import { describe, expect, it } from "vitest";
import {
  SERVICE_LOCATION_TYPES,
  serviceLocationTypeSchema,
  SERVICE_BOOKING_MODES,
  SERVICE_PRICING_MODES,
  SERVICE_STATUSES,
  serviceStatusSchema,
} from "../index";

/**
 * These exist as runtime values, not only as types. Every other enum on this
 * project is a `const` array with a zod schema derived from it, because the
 * API validates against the values at request time and a type union has none
 * of them at run time.
 */
describe("catalogue enums", () => {
  it("exposes the four service location types at runtime", () => {
    expect([...SERVICE_LOCATION_TYPES]).toEqual([
      "at_customer",
      "at_provider",
      "remote",
      "flexible",
    ]);
  });

  it("validates a known location type and rejects an unknown one", () => {
    expect(serviceLocationTypeSchema.safeParse("remote").success).toBe(true);
    expect(serviceLocationTypeSchema.safeParse("in_orbit").success).toBe(false);
  });

  it("exposes the booking and pricing modes", () => {
    expect([...SERVICE_BOOKING_MODES]).toEqual(["priced", "quote"]);
    expect([...SERVICE_PRICING_MODES]).toEqual(["fixed", "hourly"]);
  });

  it("exposes the three service statuses", () => {
    expect([...SERVICE_STATUSES]).toEqual(["draft", "published", "archived"]);
    expect(serviceStatusSchema.safeParse("draft").success).toBe(true);
    expect(serviceStatusSchema.safeParse("pending").success).toBe(false);
  });
});
