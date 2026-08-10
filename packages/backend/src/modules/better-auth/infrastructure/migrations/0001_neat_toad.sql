ALTER TABLE "better_auth"."user" ADD COLUMN "phone_number" text;--> statement-breakpoint
ALTER TABLE "better_auth"."user" ADD COLUMN "phone_number_verified" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "better_auth"."user" ADD CONSTRAINT "user_phone_number_unique" UNIQUE("phone_number");