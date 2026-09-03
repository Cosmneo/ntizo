import { z } from "zod";
import { bookingTimelineEntryReadModel } from "./booking.schema";

export { bookingTimelineEntryReadModel };

/**
 * The statuses a provider can be shown. `DRAFT` is a customer's private
 * draft — the slot is held, nobody has asked the provider anything yet — so
 * it is not in this list, and a row carrying it fails validation rather than
 * leaking into a workspace's inbox.
 */
export const PROVIDER_VISIBLE_STATUSES = [
  "PENDING_PAYMENT",
  "AWAITING_PROVIDER",
  "CONFIRMED",
  "MARKED_DONE",
  "COMPLETED",
  "DISPUTED",
  "DECLINED",
  "CANCELLED",
  "EXPIRED",
] as const;

/** The four reasons the decline dialog offers. Tokens, translated client-side. */
export const BOOKING_DECLINE_REASONS = ["not_available", "cannot_perform", "outside_area", "other"] as const;
export type BookingDeclineReason = (typeof BOOKING_DECLINE_REASONS)[number];

/**
 * One row of the provider's list. The mirror image of `bookingReadModel`:
 * that one carries facts about the provider for a customer deciding whether
 * to trust them; this one carries who the customer is and which member of
 * the workspace is booked.
 */
export const providerBookingReadModel = z.object({
  id: z.string().min(1),
  status: z.enum(PROVIDER_VISIBLE_STATUSES),
  createdAt: z.string(),

  serviceId: z.string().min(1),
  serviceOptionId: z.string().min(1),
  serviceName: z.string(),
  optionName: z.string(),
  durationMinutes: z.number().int().positive(),
  locationType: z.string().nullable(),

  /** Null when the customer booked "anyone". */
  providerMemberId: z.string().nullable(),
  memberFirstName: z.string().nullable(),

  /** Never null: "Cliente" stands in when the profile has no first name. */
  customerFirstName: z.string().min(1),

  startsAt: z.string(),
  endsAt: z.string(),
  timezone: z.string().min(1),

  /** The coarse location, always — enough to decide "can I do this there". */
  addressDistrict: z.string().nullable(),
  addressCity: z.string().nullable(),

  priceMinor: z.number().int().min(0),
  commissionBps: z.number().int().min(0).max(10_000),
  commissionMinor: z.number().int().min(0),
  currency: z.string(),

  /** `expiresAt` while AWAITING_PROVIDER; null in every other status. */
  respondBy: z.string().nullable(),
});

/**
 * One booking, for the page that decides it. The four revealable fields are
 * null until the booking is paid — see the spec's reveal rule and
 * `toProviderBookingDetailDTO`, which is where the rule lives.
 */
export const providerBookingDetailReadModel = providerBookingReadModel.extend({
  addressLabel: z.string().nullable(),
  addressLine: z.string().nullable(),
  addressDirections: z.string().nullable(),
  customerPhone: z.string().nullable(),
  customerEmail: z.string().nullable(),
  description: z.string().nullable(),
  paymentRef: z.string().nullable(),
  expiresAt: z.string().nullable(),
  timeline: z.array(bookingTimelineEntryReadModel),
});

/** A member of the workspace, for the list's filter. `id` is `provider_member.id`, which is what a booking references. */
export const providerMemberOptionReadModel = z.object({
  id: z.string().min(1),
  firstName: z.string().min(1),
});

export const providerBookingPageReadModel = z.object({
  items: z.array(providerBookingReadModel),
  total: z.number().int().min(0),
  nextOffset: z.number().int().min(0).nullable(),
  members: z.array(providerMemberOptionReadModel),
});

export type ProviderBookingDTO = z.infer<typeof providerBookingReadModel>;
export type ProviderBookingDetailDTO = z.infer<typeof providerBookingDetailReadModel>;
export type ProviderBookingPageDTO = z.infer<typeof providerBookingPageReadModel>;
export type BookingTimelineEntryDTO = z.infer<typeof bookingTimelineEntryReadModel>;
export type ProviderMemberOptionDTO = z.infer<typeof providerMemberOptionReadModel>;
