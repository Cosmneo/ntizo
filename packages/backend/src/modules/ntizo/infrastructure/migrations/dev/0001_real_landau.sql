CREATE SCHEMA "ntizo_outbox";
--> statement-breakpoint
CREATE TABLE "ntizo_outbox"."outbox_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" varchar(255) NOT NULL,
	"aggregate_type" varchar(100) NOT NULL,
	"aggregate_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"metadata" jsonb,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_outbox_event_status" ON "ntizo_outbox"."outbox_event" USING btree ("status");