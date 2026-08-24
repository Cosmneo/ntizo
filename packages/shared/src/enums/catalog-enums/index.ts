import { z } from "zod";

/**
 * A service's own lifecycle, distinct from its provider's.
 *
 * `archived` rather than deleted: bookings will point at a service and their
 * history has to keep meaning what it meant.
 */
export const SERVICE_STATUSES = ["draft", "published", "archived"] as const;
export const serviceStatusSchema = z.enum(SERVICE_STATUSES);
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

/**
 * How a service is bought.
 *
 * `priced` carries options, each with a price and a duration. `quote` carries
 * none and cannot: the whole point is that the price is not knowable until the
 * provider has seen the job.
 */
export const SERVICE_BOOKING_MODES = ["priced", "quote"] as const;
export const serviceBookingModeSchema = z.enum(SERVICE_BOOKING_MODES);
export type ServiceBookingMode = (typeof SERVICE_BOOKING_MODES)[number];

/**
 * What an option's price is per.
 *
 * `fixed` carries the duration; the customer books that block. `hourly` does
 * not — the customer chooses how long, within a minimum and a step.
 */
export const SERVICE_PRICING_MODES = ["fixed", "hourly"] as const;
export const servicePricingModeSchema = z.enum(SERVICE_PRICING_MODES);
export type ServicePricingMode = (typeof SERVICE_PRICING_MODES)[number];

/**
 * How a customer pays, as the browse asks the question.
 *
 * Not a column, and deliberately not one: it flattens `bookingMode` and the
 * default option's `pricingMode` into the three answers a customer actually
 * distinguishes between. "Is this a fixed price, a rate per hour, or do I have
 * to ask?" is one question to them and two fields to the schema, and a filter
 * offering `priced` and `quote` would make them work that out themselves.
 *
 * `quote` is `bookingMode`; `fixed` and `hourly` are the pricing mode of the
 * option a `priced` service leads with — the same option the card prices, so
 * the filter and the number beside it can never disagree.
 */
export const SERVICE_PAYMENT_MODES = ["fixed", "hourly", "quote"] as const;
export const servicePaymentModeSchema = z.enum(SERVICE_PAYMENT_MODES);
export type ServicePaymentMode = (typeof SERVICE_PAYMENT_MODES)[number];
