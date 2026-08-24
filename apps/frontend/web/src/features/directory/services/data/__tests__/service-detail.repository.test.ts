import { describe, expect, it } from "vitest";
import { SERVICE_DETAIL_FIELDS } from "@/features/directory/services/data/service-detail.repository";

/**
 * The one defect no other test in this app can catch.
 *
 * Every render test builds a complete fixture and every repository test
 * replaces the transport, so a field missing from the selection set is
 * invisible to all of them. The server does not object either: an unrequested
 * field is absent, not an error, and `undefined` renders as nothing.
 */
const READ_BY_THE_PAGE = [
  "id", "name", "description", "imageUrls",
  "providerName", "providerSlug", "providerLogoUrl", "providerCity",
  "categoryName", "locationType", "bookingMode",
  "options", "amountMinor", "isDefault",
  "performers", "firstName", "avatarUrl",
];

/**
 * Tokenised, not `toContain`'d against the raw string.
 *
 * `expect(SERVICE_DETAIL_FIELDS).toContain("id")` also passes when the
 * selection set carries only `providerId` — the substring matches inside it —
 * so a selection set missing `id` outright would still pass every one of
 * these checks. Braces are stripped along with whitespace so a nested
 * selection's `{`/`}` never becomes a spurious token.
 */
const REQUESTED_FIELDS = new Set(
  SERVICE_DETAIL_FIELDS.replace(/[{}]/g, " ").split(/\s+/).filter(Boolean),
);

describe("the service detail query", () => {
  it.each(READ_BY_THE_PAGE)("asks the server for %s", (field) => {
    expect(REQUESTED_FIELDS.has(field)).toBe(true);
  });

  it("does not pass a field by matching inside another field's name", () => {
    // The exact defect this test exists to catch, made concrete: `id` and
    // `providerId` are both real, distinct fields on the wire, and a
    // selection set missing one must not be able to pass by matching the
    // other.
    expect(REQUESTED_FIELDS.has("id")).toBe(true);
    expect(REQUESTED_FIELDS.has("providerId")).toBe(true);
    expect(REQUESTED_FIELDS.has("providerIdThatDoesNotExist")).toBe(false);
  });
});
