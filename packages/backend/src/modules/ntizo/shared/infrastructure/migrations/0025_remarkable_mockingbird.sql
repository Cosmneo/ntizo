CREATE TABLE "ntizo_booking"."booking_change" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"changed_by_user_id" text NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text NOT NULL,
	"previous_starts_at" timestamp with time zone,
	"previous_ends_at" timestamp with time zone,
	"previous_provider_member_id" uuid,
	"previous_price_minor" integer,
	CONSTRAINT "booking_change_previous_price_minor_non_negative" CHECK ("ntizo_booking"."booking_change"."previous_price_minor" IS NULL OR "ntizo_booking"."booking_change"."previous_price_minor" >= 0)
);
--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD COLUMN "provider_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD COLUMN "service_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD COLUMN "service_option_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD COLUMN "provider_member_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD COLUMN "starts_at" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD COLUMN "ends_at" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD COLUMN "declined_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD COLUMN "marked_done_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD COLUMN "disputed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD COLUMN "expired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD COLUMN "price_minor" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD COLUMN "commission_bps" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD COLUMN "commission_minor" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD COLUMN "currency" text DEFAULT 'MZN' NOT NULL;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD COLUMN "service_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD COLUMN "provider_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD COLUMN "provider_slug" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD COLUMN "option_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD COLUMN "duration_minutes" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD COLUMN "address_label" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD COLUMN "address_line" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD COLUMN "address_city" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD COLUMN "address_district" text;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD COLUMN "address_directions" text;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD COLUMN "address_lat" text;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD COLUMN "address_lng" text;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD COLUMN "payment_ref" text;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking_change" ADD CONSTRAINT "booking_change_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "ntizo_booking"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking_change" ADD CONSTRAINT "booking_change_changed_by_user_id_user_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "ntizo_user"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD CONSTRAINT "booking_provider_id_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "ntizo_provider"."provider"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD CONSTRAINT "booking_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "ntizo_catalog"."service"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD CONSTRAINT "booking_service_option_id_service_option_id_fk" FOREIGN KEY ("service_option_id") REFERENCES "ntizo_catalog"."service_option"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD CONSTRAINT "booking_provider_member_id_provider_member_id_fk" FOREIGN KEY ("provider_member_id") REFERENCES "ntizo_provider"."provider_member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_member_slot_active_uq" ON "ntizo_booking"."booking" USING btree ("provider_member_id","starts_at") WHERE "ntizo_booking"."booking"."status" in ('PENDING_PAYMENT', 'AWAITING_PROVIDER', 'CONFIRMED', 'MARKED_DONE');--> statement-breakpoint
CREATE INDEX "booking_provider_status_idx" ON "ntizo_booking"."booking" USING btree ("provider_id","status");--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD CONSTRAINT "booking_status_known" CHECK ("ntizo_booking"."booking"."status" in ('PENDING_PAYMENT', 'AWAITING_PROVIDER', 'CONFIRMED', 'MARKED_DONE', 'COMPLETED', 'DISPUTED', 'DECLINED', 'CANCELLED', 'EXPIRED'));--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD CONSTRAINT "booking_price_minor_non_negative" CHECK ("ntizo_booking"."booking"."price_minor" >= 0);--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD CONSTRAINT "booking_commission_bps_range" CHECK ("ntizo_booking"."booking"."commission_bps" BETWEEN 0 AND 10000);--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD CONSTRAINT "booking_commission_minor_non_negative" CHECK ("ntizo_booking"."booking"."commission_minor" >= 0);