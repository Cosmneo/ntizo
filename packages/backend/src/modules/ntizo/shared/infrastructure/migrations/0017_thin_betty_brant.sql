CREATE SCHEMA "ntizo_review";
--> statement-breakpoint
CREATE TABLE "ntizo_review"."review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"author_user_id" text NOT NULL,
	"booking_id" uuid,
	"rating" integer NOT NULL,
	"comment" text,
	"status" text DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_one_per_author_per_provider" UNIQUE("provider_id","author_user_id"),
	CONSTRAINT "review_rating_range" CHECK ("ntizo_review"."review"."rating" BETWEEN 1 AND 5),
	CONSTRAINT "review_status_known" CHECK ("ntizo_review"."review"."status" IN ('published', 'hidden'))
);
--> statement-breakpoint
ALTER TABLE "ntizo_review"."review" ADD CONSTRAINT "review_provider_id_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "ntizo_provider"."provider"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_review"."review" ADD CONSTRAINT "review_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "ntizo_user"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_review"."review" ADD CONSTRAINT "review_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "ntizo_booking"."booking"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_provider_status_idx" ON "ntizo_review"."review" USING btree ("provider_id","status");