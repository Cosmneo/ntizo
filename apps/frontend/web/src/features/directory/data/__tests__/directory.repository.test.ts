import { describe, expect, it } from "vitest";
import { PROVIDER_FIELDS, PROVIDER_DETAIL_FIELDS, LIST, BY_SLUG } from "../directory.repository";

/**
 * The list and the detail lookup deliberately ask for different things. If they
 * ever share one selection again, the directory's 24 cards start paying for a
 * join per card — the exact cost `providerPublicDetailReadModel` exists to
 * avoid, and a regression nothing else would catch until a slow page.
 *
 * This test checks both layers: the constants describe the intent, but the
 * queries are what is sent to the backend, and only checking the queries can
 * catch a swap (e.g. LIST accidentally using PROVIDER_DETAIL_FIELDS).
 */
describe("provider GraphQL selections", () => {
  it("keeps the detail-only fields out of the list", () => {
    for (const field of ["memberSince", "serviceLocationTypes", "weeklyHours"]) {
      expect(PROVIDER_FIELDS).not.toContain(field);
    }
  });

  it("asks for the detail-only fields on the slug lookup", () => {
    for (const field of ["memberSince", "serviceLocationTypes", "weeklyHours"]) {
      expect(PROVIDER_DETAIL_FIELDS).toContain(field);
    }
  });

  it("still asks for everything the list asks for", () => {
    for (const field of ["id", "name", "slug", "verified", "photoUrls", "fromAmountMinor"]) {
      expect(PROVIDER_DETAIL_FIELDS).toContain(field);
    }
  });

  it("selects the weekly hours' own shape", () => {
    expect(PROVIDER_DETAIL_FIELDS).toContain("weeklyHours { weekday intervals { startMinute endMinute } }");
  });

  it("LIST query does not ask for detail-only fields", () => {
    for (const field of ["memberSince", "serviceLocationTypes", "weeklyHours"]) {
      expect(LIST).not.toContain(field);
    }
  });

  it("BY_SLUG query asks for all detail-only fields", () => {
    for (const field of ["memberSince", "serviceLocationTypes", "weeklyHours"]) {
      expect(BY_SLUG).toContain(field);
    }
  });

  it("BY_SLUG query includes the weekly hours nested selection", () => {
    expect(BY_SLUG).toContain("weeklyHours { weekday intervals { startMinute endMinute } }");
  });
});
