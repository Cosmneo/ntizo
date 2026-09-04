import { describe, expect, it } from "vitest";
import {
  BOOKING_FIELDS,
  BY_ID,
  CREATE,
  SUBMIT,
} from "@/features/checkout/data/checkout.repository";

/**
 * The documents checkout actually puts on the wire, read as text.
 *
 * **This is the only test in the repo that can see them.** Every checkout
 * suite mocks `checkout.repository` wholesale — that is the right call there,
 * because those files are about pages and viewmodels, and a real transport
 * would make their failures depend on a socket — but the consequence is that
 * nothing evaluated `BOOKING_FIELDS`, `CREATE`, `BY_ID` or `SUBMIT` at all.
 * A reviewer added `commissionBps commissionMinor` to `BOOKING_FIELDS` and
 * the whole web suite stayed green: 139 files, 1526 tests. The design calls
 * the commission's absence a two-level protection and four doc comments
 * assert the second level as fact; level one is a type and the compiler keeps
 * it, level two was a template string nobody read.
 *
 * No mock and no network: these are strings, and asserting on a string is the
 * cheapest thing this repository can be held to.
 */
const DOCUMENTS: ReadonlyArray<[name: string, document: string]> = [
  ["BookingCreate", CREATE],
  ["BookingById", BY_ID],
  ["BookingSubmit", SUBMIT],
];

/**
 * Tokenised, not `toContain`'d against the raw string.
 *
 * `expect(BOOKING_FIELDS).toContain("id")` also passes when the selection
 * carries only `serviceId` — the substring matches inside it — so a selection
 * missing `id` outright would still pass. The same trap the service-detail
 * repository test documents, and the same tokeniser.
 */
const REQUESTED = new Set(BOOKING_FIELDS.replace(/[{}]/g, " ").split(/\s+/).filter(Boolean));

/** Every field steps 2 and 3 read off the booking. */
const READ_BY_THE_PAGES = [
  "id",
  "status",
  "serviceId",
  "serviceOptionId",
  "serviceName",
  "providerName",
  // The rail's trust line. Both are already public — every browse card prints
  // them — and they are what a customer about to hold a slot is deciding on,
  // which is why they are asked for here while the commission is not.
  "providerVerified",
  "providerRatingAverage",
  "optionName",
  "durationMinutes",
  // Where the work happens. The rail prints it under the appointment and
  // decides from it whether "Deslocação — Incluída" is a true sentence, so a
  // document that stopped asking would not blank a line — it would drop the
  // travel claim on every booking and look like a design decision.
  "locationType",
  "priceMinor",
  "currency",
  "startsAt",
  "endsAt",
  "timezone",
  "addressLabel",
  "expiresAt",
];

describe("the checkout query documents", () => {
  // The fence moved into the model itself, so the question this file used to
  // ask — "does the document request the commission?" — cannot be answered
  // wrong any more. What is worth asserting here is that checkout still asks
  // for every field it renders.
  it("asks for the price and the currency it renders", () => {
    expect(BOOKING_FIELDS).toContain("priceMinor");
    expect(BOOKING_FIELDS).toContain("currency");
  });

  it.each(DOCUMENTS)("%s never asks for a seat", (_name, document) => {
    // A capacity count is a legitimately public fact; the index of the seat a
    // booking took is not. `bookingReadModel` carries neither, so today there
    // is nothing here to leak — which is exactly when an assertion is worth
    // writing, because the field that would leak does not exist yet to be
    // noticed.
    expect(document).not.toMatch(/seat/i);
    expect(document).not.toMatch(/providerMemberId/i);
  });

  it.each(READ_BY_THE_PAGES)("asks the server for %s", (field) => {
    // The other direction, and the reason the seat assertions above are not
    // satisfiable by an empty selection: a document that asked for nothing
    // would pass every `not.toMatch` in this file.
    expect(REQUESTED.has(field)).toBe(true);
  });

  it("does not pass a field by matching inside another field's name", () => {
    // The tokeniser doing its job, made concrete: `id` and `serviceId` are
    // both real, distinct fields, and a selection missing one must not be
    // able to pass by matching the other.
    expect(REQUESTED.has("id")).toBe(true);
    expect(REQUESTED.has("serviceId")).toBe(true);
    expect(REQUESTED.has("idThatIsNotAField")).toBe(false);
  });

  it("sends the booking fields through the query the page actually runs", () => {
    // Ties the two halves together. Without this, `BOOKING_FIELDS` could be
    // impeccable and `BY_ID` could have stopped embedding it, and every
    // assertion above would still pass while the page fetched something else
    // entirely.
    expect(BY_ID).toContain(BOOKING_FIELDS);
  });

  it("holds a slot with the time and nothing else", () => {
    // `bookingCreate` takes no address and no description — the customer has
    // supplied neither, and the draft has to exist before they do. Both
    // belong to `bookingSubmit`. This is that design asserted against the
    // document rather than against a mock's call arguments.
    expect(CREATE).not.toMatch(/address/i);
    expect(CREATE).not.toMatch(/description/i);
    // And no phone number on the submit: setting one is the User context's
    // job, which is why step 3 is two mutations rather than one.
    expect(SUBMIT).not.toMatch(/phone/i);
  });
});
