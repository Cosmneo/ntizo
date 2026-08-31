-- Hand-written, not from `drizzle-kit generate` — Drizzle has no builder for
-- `CREATE EXTENSION`. `btree_gist` supplies the `=` operator class gist
-- needs for the `provider_member_id WITH =` operand of the exclusion
-- constraint below; a plain gist index has no notion of uuid equality on its
-- own. Confirmed available on this Neon instance (`pg_available_extensions`,
-- default_version 1.7) ahead of writing this rather than assumed.
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
DROP INDEX "ntizo_booking"."booking_member_slot_active_uq";--> statement-breakpoint
CREATE INDEX "booking_expiry_sweep_idx" ON "ntizo_booking"."booking" USING btree ("expires_at") WHERE "ntizo_booking"."booking"."status" = 'PENDING_PAYMENT';--> statement-breakpoint
CREATE INDEX "booking_customer_created_idx" ON "ntizo_booking"."booking" USING btree ("customer_id","created_at" DESC NULLS LAST);--> statement-breakpoint
-- Hand-written, not from `drizzle-kit generate` — Drizzle has no builder for
-- `EXCLUDE`. See booking.schema.ts's comment where
-- `booking_member_slot_active_uq` used to be declared, and task-4-report.md.
--
-- Replaces the index dropped above: that index's key was
-- `(provider_member_id, starts_at)`, so `ends_at` played no part in it and
-- two bookings whose ranges merely overlapped — rather than sharing an exact
-- start — both inserted. This constraint reads the member's whole range
-- instead. The `WHERE` clause is the same four slot-holding statuses
-- `SLOT_HOLDING_STATUSES` names (`booking/enums.ts`), typed out by hand
-- because a migration file cannot import that TypeScript constant — keep the
-- two in sync by hand if that list ever changes.
ALTER TABLE "ntizo_booking"."booking"
  ADD CONSTRAINT "booking_member_slot_no_overlap"
  EXCLUDE USING gist (
    "provider_member_id" WITH =,
    tstzrange("starts_at", "ends_at") WITH &&
  ) WHERE ("status" in ('PENDING_PAYMENT', 'AWAITING_PROVIDER', 'CONFIRMED', 'MARKED_DONE'));
