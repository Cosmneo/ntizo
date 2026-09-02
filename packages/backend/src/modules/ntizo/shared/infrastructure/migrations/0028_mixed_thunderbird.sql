-- This file runs as one transaction: drizzle-kit applies every statement in
-- a file together. Do not name its separator marker anywhere in this file,
-- not even inside a comment — drizzle-kit splits on that literal string
-- wherever it appears, so a comment describing the syntax becomes the
-- syntax, and Postgres receives a statement that is only a comment and
-- fails with 42601 at position 1. That happened here once.
-- Both `DROP CONSTRAINT` and `ADD CONSTRAINT ...
-- EXCLUDE` take `ACCESS EXCLUSIVE` on "booking" for as long as they run, and
-- Postgres has no `NOT VALID` / `VALIDATE CONSTRAINT` two-step for `EXCLUDE`
-- the way it does for `CHECK` and `FOREIGN KEY` — so the whole file, start to
-- finish, is an outage window on "booking" sized to however long the second
-- `ALTER TABLE` below takes to build its supporting gist index. Worth
-- knowing before this runs on a table larger than dev's.
ALTER TABLE "ntizo_booking"."booking" ADD COLUMN "seat" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
-- Hand-written, not from `drizzle-kit generate` — Drizzle has no builder for
-- `EXCLUDE`, so it never sees this constraint and would not know to drop it
-- either; this statement exists only because the next one needs the name
-- free. See booking.schema.ts's comment on `seat` and on this constraint.
--
-- **The next statement can fail on data this one permits.** The moment this
-- constraint is gone, nothing in the database stops two overlapping
-- bookings from existing on one member at the same seat — which is exactly
-- what the `ADD CONSTRAINT` below would then refuse to install over. This
-- migration is safe to write as one file only because migration `0027`
-- (which first created this constraint, with no `seat` in its key at all)
-- applied cleanly on dev: `0027`'s own `EXCLUDE` would have refused to
-- install over a table already holding two overlapping slot-holding
-- bookings on one member, so its having succeeded is proof no such pair
-- exists here — every existing row can become seat 1 (the column above's
-- default) without colliding with any other. On a stage where `0027` has
-- not yet run, that proof does not hold: `0027` must be applied first, and
-- is not guaranteed to succeed there either — that risk is already recorded
-- against `0027` itself, not repeated here.
ALTER TABLE "ntizo_booking"."booking" DROP CONSTRAINT "booking_member_slot_no_overlap";--> statement-breakpoint
-- Hand-written, not from `drizzle-kit generate` — Drizzle has no builder for
-- `EXCLUDE`, same as `0027`, which this constraint replaces. `btree_gist`
-- (installed by `0027`) already supplies the `=` operator class `seat WITH
-- =` needs, same as it does for `provider_member_id WITH =`.
--
-- Adds `seat` to the exclusion key beside `provider_member_id`. Two
-- bookings on the same member may now overlap in time, but only if they
-- also hold different seats: `member_availability.capacity` (null meaning
-- one) already lets a member hold several bookings at once on the
-- application side, and until now nothing on the database side agreed. At
-- capacity 1 every booking is seat 1, so the guarantee `0027` bought — no
-- two overlapping bookings on one member — is unchanged; capacity above 1
-- is what actually becomes possible. The `WHERE` clause is unchanged from
-- `0027`: the same four slot-holding statuses (`SLOT_HOLDING_STATUSES`,
-- `booking/enums.ts`), typed out by hand for the same reason as before — a
-- migration file cannot import that TypeScript constant.
ALTER TABLE "ntizo_booking"."booking"
  ADD CONSTRAINT "booking_member_slot_no_overlap"
  EXCLUDE USING gist (
    "provider_member_id" WITH =,
    "seat" WITH =,
    tstzrange("starts_at", "ends_at") WITH &&
  ) WHERE ("status" in ('PENDING_PAYMENT', 'AWAITING_PROVIDER', 'CONFIRMED', 'MARKED_DONE'));
