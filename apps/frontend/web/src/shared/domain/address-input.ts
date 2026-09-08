import type { AddressDTO } from "@ntizo/shared";

/**
 * One saved address in the shape every write that takes an address expects:
 * `booking.submit`, `quote.request` and `quote.accept` all declare the same
 * seven fields.
 *
 * `line1` and `line2` are joined rather than one being dropped: a flat or an
 * apartment number lives in the second line, and a provider sent to the
 * building without it is a provider standing outside the right door.
 *
 * The booking and the quote each keep this as a snapshot, so the customer
 * correcting their street next March does not move where the provider went
 * last week — which is why the components travel by value and no address id
 * is sent.
 */
export interface AddressInput {
  label: string;
  line: string;
  city: string;
  district?: string | null;
  directions?: string | null;
  lat?: number | null;
  lng?: number | null;
}

/**
 * A stored coordinate as a number, or `null`.
 *
 * `AddressDTO` carries latitude and longitude as strings, because Postgres
 * `numeric` crosses the wire as one and rounding it to a float at the read
 * model would be losing precision the column was chosen to keep. The mutations
 * take numbers, so the conversion happens here — and a value that does not
 * parse becomes `null` rather than `NaN`, which would serialise to JSON as
 * `null` anyway but only after passing through arithmetic as a number.
 */
function coordinate(raw: string | null): number | null {
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function toAddressInput(address: AddressDTO): AddressInput {
  return {
    label: address.label,
    line: [address.line1, address.line2].filter(Boolean).join(", "),
    city: address.city,
    district: address.district,
    directions: address.directions,
    lat: coordinate(address.latitude),
    lng: coordinate(address.longitude),
  };
}
