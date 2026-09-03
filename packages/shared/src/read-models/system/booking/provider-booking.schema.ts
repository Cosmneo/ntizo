import { z } from "zod";

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

export const bookingTimelineEntryReadModel = z.object({
  at: z.string(),
  /** A machine token — `booking_change.reason`, or one of the two this read adds: `created_by_customer`, `respond_by`, `pay_by`. */
  reason: z.string().min(1),
  actor: z.enum(["customer", "provider", "system"]),
  /** A deadline still ahead, drawn hollow. */
  pending: z.boolean(),
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

/**
 * How many days the dashboard looks back, and how many buckets its chart has.
 * One constant because the window is one window: the revenue card and the
 * chart must be able to disagree about nothing.
 */
export const STATS_WINDOW_DAYS = 30;

/** One bucket of the chart. `date` is the provider's local day — `2026-09-03`, not an instant. */
export const providerBookingStatsDayReadModel = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Requests that reached the workspace that day, counted on the `submitted_by_customer` hop. */
  requests: z.number().int().min(0),
  /** Bookings confirmed that day — paid, not merely accepted. */
  confirmed: z.number().int().min(0),
});

/**
 * Everything the dashboard shows, in one read. The money fields are the
 * provider's share (`priceMinor − commissionMinor`), never the listed price:
 * the commission comes out of the payout, so a gross figure here would be a
 * number the provider never receives.
 */
export const providerBookingStatsReadModel = z.object({
  awaitingResponse: z.number().int().min(0),
  awaitingPayment: z.number().int().min(0),
  /** CONFIRMED starting today, in the workspace's own timezone. */
  upcomingToday: z.number().int().min(0),
  /** CONFIRMED starting between today's first instant and seven days later; `upcomingToday` is a subset. */
  upcomingWeek: z.number().int().min(0),
  completedLast30: z.number().int().min(0),
  declinedLast30: z.number().int().min(0),
  revenueLast30Minor: z.number().int().min(0),
  /** Confirmed and still ahead: money that is coming if nothing goes wrong. */
  pipelineMinor: z.number().int().min(0),
  currency: z.string().min(1),
  /** Oldest first, zero-filled, always `STATS_WINDOW_DAYS` long. */
  perDay: z.array(providerBookingStatsDayReadModel).length(STATS_WINDOW_DAYS),
});

export type ProviderBookingStatsDayDTO = z.infer<typeof providerBookingStatsDayReadModel>;
export type ProviderBookingStatsDTO = z.infer<typeof providerBookingStatsReadModel>;
