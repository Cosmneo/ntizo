DROP INDEX "ntizo_booking"."booking_expiry_sweep_idx";--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking_change" ALTER COLUMN "changed_by_user_id" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "booking_expiry_sweep_idx" ON "ntizo_booking"."booking" USING btree ("expires_at") WHERE "ntizo_booking"."booking"."status" in ('DRAFT', 'AWAITING_PROVIDER', 'PENDING_PAYMENT');