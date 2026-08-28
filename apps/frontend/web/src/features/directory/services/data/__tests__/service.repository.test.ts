import { describe, expect, it } from "vitest";
import { SERVICE_FIELDS } from "@/features/directory/services/data/service.repository";

/**
 * The query has to ask for every field the cards read.
 *
 * This is the one thing about a GraphQL document that no other test in this
 * app can catch. Every test that renders a card builds its own fixture object
 * with all the fields present, and every test of the repository replaces the
 * transport with a double that answers whatever it is asked — so a field
 * missing from the selection set is invisible to all of them. The server is no
 * help either: an unrequested field is not an error, it is simply absent, and
 * `undefined` renders as nothing.
 *
 * `providerSlug` shipped missing exactly this way. Every card in the browse
 * linked to `/providers/undefined`, and the whole suite was green — it took
 * clicking one.
 *
 * Listed by hand rather than derived from the DTO type: most of `ServiceDTO`
 * is optional to any given screen, and asking for all of it would trade dead
 * links for wasted bytes. These are the fields the browse and the provider
 * page actually dereference.
 */
const READ_BY_THE_CARDS = [
  "id",
  // What the card links to. Its absence is a dead link, not a missing label,
  // which is why it is first.
  "providerSlug",
  "providerId",
  "providerName",
  "name",
  "imageUrls",
  "defaultOption",
  "bookingMode",
  // The two chips under the price. Both resolved server-side — `categoryName`
  // because a card must not print a raw `hair`, and `locationType` because the
  // client turns it into a translated phrase.
  "categoryName",
  "locationType",
  // The chip a service card shares with its provider card — see
  // `service-listing-card.tsx`'s `service.providerVerified` read.
  "providerVerified",
  // The stars beside it, both dereferenced by the same card. Trimming these
  // two out of `SERVICE_FIELDS` would take the rating off every service card
  // on the platform with the whole suite green: the card tests build their own
  // fixtures, so they would go on rendering stars nobody could see.
  "providerRatingAverage",
  "providerReviewCount",
];

describe("the browse and provider-page service query", () => {
  it.each(READ_BY_THE_CARDS)("asks the server for %s", (field) => {
    expect(SERVICE_FIELDS).toContain(field);
  });
});
