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

describe("the service detail query", () => {
  it.each(READ_BY_THE_PAGE)("asks the server for %s", (field) => {
    expect(SERVICE_DETAIL_FIELDS).toContain(field);
  });
});
