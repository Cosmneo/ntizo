CREATE SCHEMA "ntizo_quote";
--> statement-breakpoint
CREATE TABLE "ntizo_quote"."quote" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"customer_id" text NOT NULL,
	"thread_id" uuid NOT NULL,
	"status" text NOT NULL,
	"expires_at" timestamp with time zone,
	"locale" text NOT NULL,
	"description" text NOT NULL,
	"needed_by" date,
	"address_label" text,
	"address_line" text,
	"address_city" text,
	"address_district" text,
	"address_directions" text,
	"address_lat" text,
	"address_lng" text,
	"closed_reason" text,
	"closed_note" text,
	"closed_by_user_id" text,
	"expired_cause" text,
	"booking_id" uuid,
	"requested_at" timestamp with time zone NOT NULL,
	"proposed_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"declined_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"expired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quote_status_known" CHECK ("ntizo_quote"."quote"."status" in ('REQUESTED', 'PROPOSED', 'ACCEPTED', 'DECLINED', 'REJECTED', 'WITHDRAWN', 'EXPIRED')),
	CONSTRAINT "quote_expired_cause_known" CHECK ("ntizo_quote"."quote"."expired_cause" IS NULL OR "ntizo_quote"."quote"."expired_cause" in ('provider_did_not_respond', 'proposal_lapsed'))
);
--> statement-breakpoint
CREATE TABLE "ntizo_quote"."quote_attachment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"proposal_id" uuid,
	"step" text NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quote_attachment_step_known" CHECK ("ntizo_quote"."quote_attachment"."step" in ('request', 'proposal', 'closing')),
	CONSTRAINT "quote_attachment_proposal_step" CHECK (("ntizo_quote"."quote_attachment"."step" = 'proposal') = ("ntizo_quote"."quote_attachment"."proposal_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "ntizo_quote"."quote_proposal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"price_minor" integer NOT NULL,
	"currency" text DEFAULT 'MZN' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"provider_member_id" uuid NOT NULL,
	"note" text,
	"valid_until" timestamp with time zone NOT NULL,
	"created_by_user_id" text NOT NULL,
	"superseded_at" timestamp with time zone,
	"superseded_cause" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quote_proposal_price_positive" CHECK ("ntizo_quote"."quote_proposal"."price_minor" > 0),
	CONSTRAINT "quote_proposal_duration_positive" CHECK ("ntizo_quote"."quote_proposal"."duration_minutes" > 0),
	CONSTRAINT "quote_proposal_superseded_cause_known" CHECK ("ntizo_quote"."quote_proposal"."superseded_cause" IS NULL OR "ntizo_quote"."quote_proposal"."superseded_cause" in ('revised', 'slot_taken'))
);
--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ALTER COLUMN "service_option_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ALTER COLUMN "option_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD COLUMN "quote_id" uuid;--> statement-breakpoint
ALTER TABLE "ntizo_platform"."platform_settings" ADD COLUMN "quote_proposal_validity_hours" integer DEFAULT 72 NOT NULL;--> statement-breakpoint
ALTER TABLE "ntizo_quote"."quote" ADD CONSTRAINT "quote_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "ntizo_catalog"."service"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_quote"."quote" ADD CONSTRAINT "quote_provider_id_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "ntizo_provider"."provider"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_quote"."quote" ADD CONSTRAINT "quote_customer_id_user_id_fk" FOREIGN KEY ("customer_id") REFERENCES "ntizo_user"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_quote"."quote" ADD CONSTRAINT "quote_thread_id_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "ntizo_communication"."thread"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_quote"."quote" ADD CONSTRAINT "quote_closed_by_user_id_user_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "ntizo_user"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_quote"."quote_attachment" ADD CONSTRAINT "quote_attachment_quote_id_quote_id_fk" FOREIGN KEY ("quote_id") REFERENCES "ntizo_quote"."quote"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_quote"."quote_attachment" ADD CONSTRAINT "quote_attachment_proposal_id_quote_proposal_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "ntizo_quote"."quote_proposal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_quote"."quote_proposal" ADD CONSTRAINT "quote_proposal_quote_id_quote_id_fk" FOREIGN KEY ("quote_id") REFERENCES "ntizo_quote"."quote"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_quote"."quote_proposal" ADD CONSTRAINT "quote_proposal_provider_member_id_provider_member_id_fk" FOREIGN KEY ("provider_member_id") REFERENCES "ntizo_provider"."provider_member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_quote"."quote_proposal" ADD CONSTRAINT "quote_proposal_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "ntizo_user"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quote_open_per_customer_service_uq" ON "ntizo_quote"."quote" USING btree ("customer_id","service_id") WHERE "ntizo_quote"."quote"."status" in ('REQUESTED', 'PROPOSED');--> statement-breakpoint
CREATE INDEX "quote_customer_recent_idx" ON "ntizo_quote"."quote" USING btree ("customer_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "quote_provider_status_idx" ON "ntizo_quote"."quote" USING btree ("provider_id","status","expires_at");--> statement-breakpoint
CREATE INDEX "quote_sweep_idx" ON "ntizo_quote"."quote" USING btree ("expires_at") WHERE "ntizo_quote"."quote"."status" in ('REQUESTED', 'PROPOSED');--> statement-breakpoint
CREATE INDEX "quote_attachment_quote_idx" ON "ntizo_quote"."quote_attachment" USING btree ("quote_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quote_proposal_live_uq" ON "ntizo_quote"."quote_proposal" USING btree ("quote_id") WHERE "ntizo_quote"."quote_proposal"."superseded_at" IS NULL;--> statement-breakpoint
CREATE INDEX "quote_proposal_quote_recent_idx" ON "ntizo_quote"."quote_proposal" USING btree ("quote_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD CONSTRAINT "booking_quote_id_quote_id_fk" FOREIGN KEY ("quote_id") REFERENCES "ntizo_quote"."quote"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD CONSTRAINT "booking_origin_exactly_one" CHECK (("ntizo_booking"."booking"."service_option_id" IS NOT NULL) <> ("ntizo_booking"."booking"."quote_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "ntizo_platform"."platform_settings" ADD CONSTRAINT "platform_settings_quote_proposal_validity_hours_positive" CHECK ("ntizo_platform"."platform_settings"."quote_proposal_validity_hours" >= 1);