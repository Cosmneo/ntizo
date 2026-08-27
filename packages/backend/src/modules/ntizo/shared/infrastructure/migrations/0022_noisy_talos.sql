CREATE SCHEMA "ntizo_activity";
--> statement-breakpoint
CREATE TABLE "ntizo_activity"."activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" text NOT NULL,
	"type" varchar(64) NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_activity_actor_occurred" ON "ntizo_activity"."activity" USING btree ("actor_user_id","occurred_at" DESC NULLS LAST,"id" DESC NULLS LAST);