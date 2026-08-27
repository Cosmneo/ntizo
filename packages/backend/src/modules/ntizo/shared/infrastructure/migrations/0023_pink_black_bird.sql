CREATE SCHEMA "ntizo_communication";
--> statement-breakpoint
CREATE TABLE "ntizo_communication"."thread" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar(32) NOT NULL,
	"customer_user_id" text NOT NULL,
	"provider_id" uuid NOT NULL,
	"last_message_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ntizo_communication"."message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"sender_user_id" text NOT NULL,
	"body" text NOT NULL,
	"read_at" timestamp with time zone,
	"notify_due_at" timestamp with time zone,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ntizo_communication"."thread" ADD CONSTRAINT "thread_customer_user_id_user_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "ntizo_user"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_communication"."thread" ADD CONSTRAINT "thread_provider_id_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "ntizo_provider"."provider"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_communication"."message" ADD CONSTRAINT "message_thread_id_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "ntizo_communication"."thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_communication"."message" ADD CONSTRAINT "message_sender_user_id_user_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "ntizo_user"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "thread_customer_provider_uq" ON "ntizo_communication"."thread" USING btree ("customer_user_id","provider_id") WHERE "ntizo_communication"."thread"."type" = 'inquiry';--> statement-breakpoint
CREATE INDEX "idx_thread_customer_recent" ON "ntizo_communication"."thread" USING btree ("customer_user_id","last_message_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_thread_provider_recent" ON "ntizo_communication"."thread" USING btree ("provider_id","last_message_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_message_thread_recent" ON "ntizo_communication"."message" USING btree ("thread_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_message_notify_due" ON "ntizo_communication"."message" USING btree ("notify_due_at") WHERE "ntizo_communication"."message"."notify_due_at" IS NOT NULL AND "ntizo_communication"."message"."read_at" IS NULL AND "ntizo_communication"."message"."notified_at" IS NULL;