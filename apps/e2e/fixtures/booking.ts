import { sql } from "./db";
import { createVerifiedUser } from "./auth";
import { createProvider } from "./provider";

/**
 * Fixed rather than randomised, unlike the provider's own name below: the
 * spec matches a `RegExp` against it (`getByRole("row", { name: … })`) and a
 * literal is what makes that match unambiguous against every other row a
 * parallel worker's own booking might be adding to the same table.
 */
export const BOOKING_SERVICE_NAME = "Manicure Expresso E2E";

export interface SeededBooking {
  bookingId: string;
  serviceName: string;
}

/**
 * Seeds one `AWAITING_PROVIDER` booking for `customerId`, bypassing checkout
 * the same way `createProvider` bypasses `providerCreate` — for the same
 * reason. This suite's job is the customer's own list, detail and cancel
 * surface (Tasks 1-9 of this plan), not the multi-step checkout wizard,
 * which needs a live availability grid to offer a real slot and has no e2e
 * coverage of its own to reuse; driving it here would couple this spec to
 * copy and widgets several bounded contexts upstream of the one under test.
 *
 * What a real `SubmitBookingCommand` would have produced is reproduced by
 * hand instead: a provider, a published service and option, and a `booking`
 * row already past `DRAFT`. The customer-facing timeline needs nothing
 * beyond that — `timelineOf` (read/booking/app/use-cases/booking-timeline.ts)
 * synthesises its first entry ("Pedido enviado", `created_by_customer`) from
 * the row's own `createdAt` unconditionally, so no `booking_change` row has
 * to be written to make it appear.
 *
 * Returns the booking id and the fixed service name the spec matches rows
 * on.
 */
export async function seedAwaitingBooking(customerId: string): Promise<SeededBooking> {
  const suffix = crypto.randomUUID().slice(0, 8);
  const providerName = `Prestador E2E ${suffix}`;
  const providerSlug = `e2e-provider-${suffix}`;

  // A provider distinct from the customer's own account — `createProvider`
  // would otherwise mint one anyway, but this run needs the id back to look
  // up the membership row `booking.provider_member_id` references.
  const ownerId = (await createVerifiedUser()).id;
  const providerId = await createProvider({
    name: providerName,
    slug: providerSlug,
    city: "Maputo",
    country: "Mozambique",
    ownerUserId: ownerId,
  });

  const [member] = await sql()<{ id: string }[]>`
    SELECT id FROM ntizo_provider.provider_member
    WHERE provider_id = ${providerId} AND user_id = ${ownerId}
    LIMIT 1`;
  if (!member) {
    throw new Error("[e2e] seedAwaitingBooking: createProvider did not leave a member row");
  }

  const [categoryRow] = await sql()<{ id: string }[]>`
    INSERT INTO ntizo_catalog.category (code) VALUES (${`e2e-category-${suffix}`})
    RETURNING id`;

  const [serviceRow] = await sql()<{ id: string }[]>`
    INSERT INTO ntizo_catalog.service
      (provider_id, category_id, source_locale, location_type, status)
    VALUES
      (${providerId}, ${categoryRow!.id}, 'pt-MZ', 'at_customer', 'published')
    RETURNING id`;

  const [optionRow] = await sql()<{ id: string }[]>`
    INSERT INTO ntizo_catalog.service_option
      (service_id, pricing_mode, amount_minor, currency, duration_minutes)
    VALUES
      (${serviceRow!.id}, 'fixed', 180000, 'MZN', 60)
    RETURNING id`;

  // A few days out — far enough that no sweep or deadline-driven job in a
  // slow CI run can cross it while this spec is still using the row.
  const startsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const [bookingRow] = await sql()<{ id: string }[]>`
    INSERT INTO ntizo_booking.booking (
      customer_id, provider_id, service_id, service_option_id, provider_member_id,
      starts_at, ends_at, status, expires_at,
      price_minor, commission_bps, commission_minor, currency,
      service_name, provider_name, provider_slug, option_name, duration_minutes,
      address_label, address_line, address_city, description
    ) VALUES (
      ${customerId}, ${providerId}, ${serviceRow!.id}, ${optionRow!.id}, ${member.id},
      ${startsAt}, ${endsAt}, 'AWAITING_PROVIDER', ${expiresAt},
      180000, 1000, 18000, 'MZN',
      ${BOOKING_SERVICE_NAME}, ${providerName}, ${providerSlug}, 'Padrão', 60,
      'Casa', 'Avenida Julius Nyerere, 123', 'Maputo', null
    )
    RETURNING id`;
  if (!bookingRow) {
    throw new Error("[e2e] seedAwaitingBooking: insert into ntizo_booking.booking returned no row");
  }

  return { bookingId: bookingRow.id, serviceName: BOOKING_SERVICE_NAME };
}
