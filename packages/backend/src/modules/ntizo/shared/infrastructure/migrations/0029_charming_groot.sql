-- DRAFT joins BOOKING_STATUSES (booking/enums.ts): the checkout hold behind
-- the mockup's "Hora reservada 29:40" countdown, held from the moment a
-- customer picks a slot rather than from the moment they finish. That is
-- what forces the drop-and-recreate of booking_status_known below --
-- Postgres has no ALTER on a CHECK's expression.
--
-- checkout_hold_minutes and provider_response_minutes are the two other new
-- platform_settings columns Task 1 of the payment-and-confirmation-order
-- plan adds: how long a DRAFT holds its slot, and how long a provider has
-- to answer once one reaches them. Both LIVE, both >= 1 for the same reason
-- payment_window_minutes already is -- a zero-minute window is a deadline
-- that has already passed the instant the row exists.
ALTER TABLE "ntizo_booking"."booking" DROP CONSTRAINT "booking_status_known";--> statement-breakpoint
ALTER TABLE "ntizo_platform"."platform_settings" ADD COLUMN "checkout_hold_minutes" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "ntizo_platform"."platform_settings" ADD COLUMN "provider_response_minutes" integer DEFAULT 120 NOT NULL;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD CONSTRAINT "booking_status_known" CHECK ("ntizo_booking"."booking"."status" in ('DRAFT', 'PENDING_PAYMENT', 'AWAITING_PROVIDER', 'CONFIRMED', 'MARKED_DONE', 'COMPLETED', 'DISPUTED', 'DECLINED', 'CANCELLED', 'EXPIRED'));--> statement-breakpoint
ALTER TABLE "ntizo_platform"."platform_settings" ADD CONSTRAINT "platform_settings_checkout_hold_minutes_positive" CHECK ("ntizo_platform"."platform_settings"."checkout_hold_minutes" >= 1);--> statement-breakpoint
ALTER TABLE "ntizo_platform"."platform_settings" ADD CONSTRAINT "platform_settings_provider_response_minutes_positive" CHECK ("ntizo_platform"."platform_settings"."provider_response_minutes" >= 1);--> statement-breakpoint
-- HAND-WRITTEN, not from drizzle-kit generate -- Drizzle has no builder for
-- EXCLUDE, so it never sees this constraint and would not know DRAFT needs
-- to reach its predicate. This is the fourth reader of SLOT_HOLDING_STATUSES
-- (booking/enums.ts) and the only one that does not follow automatically
-- from adding DRAFT to that constant -- see that constant's own comment,
-- and booking.schema.ts's comment on this same constraint. Its own catalog
-- test (booking-constraints.test.ts, pg_get_constraintdef) is what turns a
-- forgotten edit here into a failing test rather than a silent gap.
--
-- Same shape as migration 0028, which built this constraint's WHERE from
-- the four statuses that held a slot before DRAFT existed: an identical
-- drop-and-recreate, because EXCLUDE has no ALTER for its expression either,
-- and the same ACCESS EXCLUSIVE lock on "booking" for as long as it runs --
-- see 0028's own header comment on why that has no NOT VALID two-step.
ALTER TABLE "ntizo_booking"."booking" DROP CONSTRAINT "booking_member_slot_no_overlap";--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking"
  ADD CONSTRAINT "booking_member_slot_no_overlap"
  EXCLUDE USING gist (
    "provider_member_id" WITH =,
    "seat" WITH =,
    tstzrange("starts_at", "ends_at") WITH &&
  ) WHERE ("status" in ('DRAFT', 'PENDING_PAYMENT', 'AWAITING_PROVIDER', 'CONFIRMED', 'MARKED_DONE'));