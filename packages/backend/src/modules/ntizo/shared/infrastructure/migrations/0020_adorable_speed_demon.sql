CREATE TABLE "ntizo_notification"."notification_delivery" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid,
	"type" text NOT NULL,
	"channel" text NOT NULL,
	"to_email" text NOT NULL,
	"locale" text NOT NULL,
	"status" text NOT NULL,
	"provider_message_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_delivery_status_known" CHECK ("ntizo_notification"."notification_delivery"."status" IN ('queued', 'sent', 'failed', 'suppressed')),
	CONSTRAINT "notification_delivery_channel_known" CHECK ("ntizo_notification"."notification_delivery"."channel" IN ('EMAIL'))
);
--> statement-breakpoint
CREATE TABLE "ntizo_notification"."email_suppression" (
	"email" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"suppressed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"detail" jsonb,
	CONSTRAINT "email_suppression_reason_known" CHECK ("ntizo_notification"."email_suppression"."reason" IN ('bounce', 'complaint'))
);
--> statement-breakpoint
ALTER TABLE "ntizo_notification"."notification_delivery" ADD CONSTRAINT "notification_delivery_notification_id_notification_id_fk" FOREIGN KEY ("notification_id") REFERENCES "ntizo_notification"."notification"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_delivery_email_idx" ON "ntizo_notification"."notification_delivery" USING btree ("to_email","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notification_delivery_status_idx" ON "ntizo_notification"."notification_delivery" USING btree ("status");--> statement-breakpoint
CREATE INDEX "notification_delivery_message_idx" ON "ntizo_notification"."notification_delivery" USING btree ("provider_message_id") WHERE "ntizo_notification"."notification_delivery"."provider_message_id" IS NOT NULL;