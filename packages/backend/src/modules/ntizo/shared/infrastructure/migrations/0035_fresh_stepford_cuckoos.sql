CREATE TABLE "ntizo_communication"."support_request" (
	"thread_id" uuid PRIMARY KEY NOT NULL,
	"audience" varchar(16) NOT NULL,
	"subject" varchar(120) NOT NULL,
	"booking_id" uuid,
	"status" varchar(16) NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_request_audience_known" CHECK ("ntizo_communication"."support_request"."audience" in ('customer', 'provider')),
	CONSTRAINT "support_request_status_known" CHECK ("ntizo_communication"."support_request"."status" in ('open', 'resolved')),
	CONSTRAINT "support_request_resolved_consistent" CHECK (("ntizo_communication"."support_request"."status" = 'open') = ("ntizo_communication"."support_request"."resolved_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "ntizo_communication"."thread" ALTER COLUMN "provider_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ntizo_communication"."message" ADD COLUMN "sender_side" varchar(16);--> statement-breakpoint
UPDATE "ntizo_communication"."message" m SET "sender_side" = CASE WHEN m."sender_user_id" = t."customer_user_id" THEN 'customer' ELSE 'provider' END FROM "ntizo_communication"."thread" t WHERE t."id" = m."thread_id";--> statement-breakpoint
ALTER TABLE "ntizo_communication"."message" ALTER COLUMN "sender_side" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ntizo_communication"."support_request" ADD CONSTRAINT "support_request_thread_id_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "ntizo_communication"."thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_communication"."support_request" ADD CONSTRAINT "support_request_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "ntizo_booking"."booking"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_communication"."support_request" ADD CONSTRAINT "support_request_resolved_by_user_id_user_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "ntizo_user"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_support_request_status_created" ON "ntizo_communication"."support_request" USING btree ("status","created_at" DESC NULLS LAST,"thread_id" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "ntizo_communication"."thread" ADD CONSTRAINT "thread_type_known" CHECK ("ntizo_communication"."thread"."type" in ('inquiry', 'support'));--> statement-breakpoint
ALTER TABLE "ntizo_communication"."thread" ADD CONSTRAINT "thread_inquiry_has_provider" CHECK ("ntizo_communication"."thread"."type" <> 'inquiry' OR "ntizo_communication"."thread"."provider_id" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "ntizo_communication"."message" ADD CONSTRAINT "message_sender_side_known" CHECK ("ntizo_communication"."message"."sender_side" in ('customer', 'provider', 'platform'));