/**
 * Whether the slot a checkout is trying to buy is one anybody actually
 * offered.
 *
 * `CreateBookingCommand` used to take `providerMemberId` and `startsAt` from
 * the client and check neither against anything but a foreign key — a
 * signed-in customer could post any provider's member id against any other
 * provider's service option, and the partial unique index would hold that
 * member's calendar against every real customer from then on, invisibly,
 * because every provider-side query filters on `provider_id`. This port is
 * what closes that hole.
 *
 * **It answers the question by calling Scheduling's own rules, not by
 * restating them.** `list-service-availability.projection.ts` —
 * `ListServiceAvailability`, the query behind the availability modal —
 * already decides which member may perform a service
 * (`ServiceMemberCannotPerformError`), that the provider must be `active`
 * (`provider.status` defaults to `pending`, and a workspace suspended after
 * trading has already handed its ids out), and which starts are on the grid,
 * via `startsForDay` in `@ntizo/shared/scheduling`. `DrizzleSlotValidityReader`
 * reads the same tables that projection reads and calls that same
 * `startsForDay` engine — the actual grid-generation algorithm — rather than
 * a second implementation of it. Two independent definitions of "is this
 * slot free" is the defect this whole plan exists to close; reproducing it
 * one layer up would be building the same bug in a new place. What it cannot
 * avoid duplicating is a small amount of query and timezone-conversion glue
 * (turning `booking` rows into per-civil-date busy intervals) — that is data
 * plumbing, not an availability rule, and the sibling implementation it
 * mirrors (`DrizzleBookingBusyAdapter`, in Scheduling's own infrastructure)
 * has no exported piece this reader could call instead. See that adapter's
 * own file for why the split exists at all.
 *
 * **`startsAt` in the past is not a Scheduling rule.** `ListServiceAvailability`
 * has no notion of "now" — it answers whatever `from`/`to` window it is asked
 * about, past window included. A booking that has already happened is a
 * booking-specific refusal, so this reader checks it directly rather than
 * pretending it came from the grid.
 *
 * **`durationMinutes` is trusted from the caller, not re-derived.**
 * `CreateBookingCommand` already read it off the exact service option being
 * bought (`pricing.durationMinutes`) before this port is ever called. That
 * matters because a service can carry more than one fixed-price option with
 * different durations, but `ListServiceAvailability` only ever sizes its grid
 * off the service's single default option (`resolveOffer` reads
 * `info.defaultOption`, never the option a particular caller asked about).
 * Rebuilding the offer from the *default* option here — the more literal
 * reading of "call Scheduling's rules" — would make this reader agree with
 * the modal only when the option being booked happens to be the default one,
 * and silently validate against the wrong duration otherwise. Using the real
 * option's own duration is the answer that is actually correct for what is
 * being bought; where it disagrees with what the modal displayed for a
 * non-default option, that disagreement already exists in
 * `ListServiceAvailability` today and is not something this task touches.
 *
 * `serviceOptionId` is carried on the input for the same reason `serviceId`
 * and `providerMemberId` are — it names the thing being checked — but is not
 * read by `DrizzleSlotValidityReader`: nothing about which specific option a
 * customer chose changes whether a *member* can work at a given *instant*.
 */
export interface SlotValidityCheckInput {
  readonly serviceId: string;
  readonly serviceOptionId: string;
  readonly providerMemberId: string;
  readonly startsAt: Date;
  readonly durationMinutes: number;
}

/**
 * Why a slot was refused — one union, so `CreateBookingCommand` can turn each
 * value into its own named error via an exhaustive `Record`, the same
 * pattern `ServiceNotBookableError` already uses for its four reasons. A
 * `switch` with no `default` would let a fifth reason compile silently with
 * no throw at all; a `Record` missing a key is a compile error instead.
 */
export type SlotValidityReason =
  | "provider_not_active"
  | "member_cannot_perform_service"
  | "starts_at_in_past"
  | "slot_not_offered";

export type SlotValidityResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: SlotValidityReason };

export interface SlotValidityReaderPort {
  check(input: SlotValidityCheckInput): Promise<SlotValidityResult>;
}
