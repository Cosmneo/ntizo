import { sql } from "./db";
import { createVerifiedUser, type VerifiedUser } from "./auth";
import { createProvider } from "./provider";

/**
 * Fixed rather than randomised, the same choice `booking.ts` makes for
 * `BOOKING_SERVICE_NAME` and for the same reason: a spec matches a `RegExp`
 * against it, and every row this name could ever appear in is already
 * scoped to the one customer's own list or the one workspace's own queue
 * that this fixture just created — a literal is what makes the match
 * unambiguous, not a hedge against some other worker's row leaking in.
 */
export const QUOTE_SERVICE_NAME = "AC Installation E2E";

export interface SeededQuoteService {
  serviceId: string;
  serviceName: string;
  providerId: string;
  providerSlug: string;
  providerName: string;
  owner: VerifiedUser;
}

/**
 * Seeds one published, `quote`-mode service with no priced options — a
 * provider willing to price a job on request, ready for
 * `quoteRequest`/`quotePropose` to be driven through the real UI on top of
 * it.
 *
 * Bypasses the onboarding wizard's own service-creation screens the same
 * way `seedAwaitingBooking` bypasses checkout: this suite's job is the
 * request/proposal/acceptance pipeline (Task 14 of the quotes-web plan), not
 * the provider's seven-step service editor, which has no e2e coverage of
 * its own to reuse.
 *
 * The `service_quote_form` row this inserts asks for nothing beyond the
 * description (`askDeadline`/`askPhotos`/`askLocation` all `false`) —
 * deliberately, on both counts:
 *
 * 1. It keeps the request form to the one field every quote needs, so the
 *    spec's assertions are about the request/proposal/acceptance pipeline
 *    joining up, not about exercising every optional field a provider could
 *    configure (Tasks 1-5's own unit tests already cover each of those in
 *    isolation).
 * 2. It sidesteps a default mismatch this reading turned up, and the
 *    whole-branch fix wave then closed, between the read side and the write
 *    side: with `locationType: "at_provider"` and *no* `service_quote_form`
 *    row at all, `RequestQuoteCommand` defaults `askLocation` to `true`
 *    (`service.quoteForm?.askLocation ?? true` — see
 *    `request-quote.command.ts`), and `request-page.tsx` now defaults the
 *    identical fallback the same way. Inserting an explicit row with
 *    `askLocation: false` still keeps this fixture's own request form to the
 *    one field every quote needs, described in point 1 above.
 *
 * One `service_member` row too, matching one performer — the provider's own
 * owner — so the proposal form's "who does the work" field pre-selects
 * itself instead of needing a choice from a list of one.
 */
export async function seedQuoteService(): Promise<SeededQuoteService> {
  const suffix = crypto.randomUUID().slice(0, 8);
  const providerName = `Quote Provider E2E ${suffix}`;
  const providerSlug = `e2e-quote-provider-${suffix}`;

  const owner = await createVerifiedUser(undefined, { firstName: "Priya", lastName: "Provider" });
  const providerId = await createProvider({
    name: providerName,
    slug: providerSlug,
    city: "Maputo",
    country: "Mozambique",
    ownerUserId: owner.id,
  });

  const [member] = await sql()<{ id: string }[]>`
    SELECT id FROM ntizo_provider.provider_member
    WHERE provider_id = ${providerId} AND user_id = ${owner.id}
    LIMIT 1`;
  if (!member) {
    throw new Error("[e2e] seedQuoteService: createProvider did not leave a member row");
  }

  const [categoryRow] = await sql()<{ id: string }[]>`
    INSERT INTO ntizo_catalog.category (code) VALUES (${`e2e-quote-category-${suffix}`})
    RETURNING id`;

  const [serviceRow] = await sql()<{ id: string }[]>`
    INSERT INTO ntizo_catalog.service
      (provider_id, category_id, source_locale, location_type, booking_mode, status)
    VALUES
      (${providerId}, ${categoryRow!.id}, 'en-US', 'at_provider', 'quote', 'published')
    RETURNING id`;
  if (!serviceRow) {
    throw new Error("[e2e] seedQuoteService: insert into ntizo_catalog.service returned no row");
  }

  await sql()`
    INSERT INTO ntizo_catalog.service_translation (service_id, locale, name)
    VALUES (${serviceRow.id}, 'en-US', ${QUOTE_SERVICE_NAME})`;

  // See this function's own doc comment: explicit and all `false`, not
  // omitted, to keep this fixture's request form to the one field every
  // quote needs — both sides now default an omitted row's `askLocation` to
  // `true` alike.
  await sql()`
    INSERT INTO ntizo_catalog.service_quote_form
      (service_id, response_hours, ask_deadline, ask_photos, ask_location)
    VALUES (${serviceRow.id}, 48, false, false, false)`;

  await sql()`
    INSERT INTO ntizo_catalog.service_member (service_id, member_id)
    VALUES (${serviceRow.id}, ${member.id})`;

  return {
    serviceId: serviceRow.id,
    serviceName: QUOTE_SERVICE_NAME,
    providerId,
    providerSlug,
    providerName,
    owner,
  };
}
