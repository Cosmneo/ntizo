DROP INDEX "ntizo_booking"."booking_sweep_idx";--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD COLUMN "reminded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ntizo_communication"."support_request" ADD COLUMN "kind" varchar(16) DEFAULT 'support' NOT NULL;--> statement-breakpoint
CREATE INDEX "booking_sweep_idx" ON "ntizo_booking"."booking" USING btree ("expires_at") WHERE "ntizo_booking"."booking"."status" in ('DRAFT', 'AWAITING_PROVIDER', 'PENDING_PAYMENT', 'CONFIRMED', 'MARKED_DONE');--> statement-breakpoint
ALTER TABLE "ntizo_communication"."support_request" ADD CONSTRAINT "support_request_kind_known" CHECK ("ntizo_communication"."support_request"."kind" in ('support', 'dispute'));
--> statement-breakpoint
-- Every booking already at CONFIRMED carries a stale `expires_at`: the payment
-- deadline `accept` wrote, long past. The moment CONFIRMED becomes
-- deadline-bearing they are all due at once, which is correct — they are the
-- bookings this work exists to unstick — but their deadline should be the one
-- this design gives them, not a leftover. The sweep's LIMIT 200 a minute drains
-- the backlog rather than mailing every provider their whole history at once.
UPDATE "ntizo_booking"."booking" SET "expires_at" = "ends_at" WHERE "status" = 'CONFIRMED';