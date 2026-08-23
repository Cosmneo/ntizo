CREATE SCHEMA "ntizo_notification";
--> statement-breakpoint
CREATE TABLE "ntizo_notification"."notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"audience" text NOT NULL,
	"user_id" text,
	"provider_id" uuid,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_audience_known" CHECK ("ntizo_notification"."notification"."audience" IN ('user', 'provider')),
	CONSTRAINT "notification_one_addressee" CHECK (num_nonnulls("ntizo_notification"."notification"."user_id", "ntizo_notification"."notification"."provider_id") = 1),
	CONSTRAINT "notification_audience_matches_addressee" CHECK (("ntizo_notification"."notification"."audience" = 'user' AND "ntizo_notification"."notification"."user_id" IS NOT NULL)
          OR ("ntizo_notification"."notification"."audience" = 'provider' AND "ntizo_notification"."notification"."provider_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "ntizo_notification"."notification_read" (
	"notification_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_read_notification_id_user_id_pk" PRIMARY KEY("notification_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "ntizo_notification"."notification" ADD CONSTRAINT "notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "ntizo_user"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_notification"."notification" ADD CONSTRAINT "notification_provider_id_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "ntizo_provider"."provider"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_notification"."notification_read" ADD CONSTRAINT "notification_read_notification_id_notification_id_fk" FOREIGN KEY ("notification_id") REFERENCES "ntizo_notification"."notification"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_notification"."notification_read" ADD CONSTRAINT "notification_read_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "ntizo_user"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_user_idx" ON "ntizo_notification"."notification" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notification_provider_idx" ON "ntizo_notification"."notification" USING btree ("provider_id","created_at" DESC NULLS LAST);