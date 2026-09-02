ALTER TABLE "ntizo_booking"."booking" ADD COLUMN "charge_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD COLUMN "last_charge_attempt_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "booking_charge_idx" ON "ntizo_booking"."booking" USING btree ("expires_at") WHERE "ntizo_booking"."booking"."status" = 'PENDING_PAYMENT';--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD CONSTRAINT "booking_charge_attempts_non_negative" CHECK ("ntizo_booking"."booking"."charge_attempts" >= 0);