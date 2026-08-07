CREATE SCHEMA "ntizo_user";
--> statement-breakpoint
CREATE SCHEMA "ntizo_provider";
--> statement-breakpoint
CREATE SCHEMA "ntizo_booking";
--> statement-breakpoint
CREATE TABLE "ntizo_user"."profile" (
	"user_id" text PRIMARY KEY NOT NULL,
	"first_name" text DEFAULT '' NOT NULL,
	"last_name" text DEFAULT '' NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"phone_number" text,
	"bio" text,
	"language" text DEFAULT 'en-US' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"date_of_birth" date,
	"gender" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ntizo_user"."user" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'customer' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"verification_status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "ntizo_provider"."provider" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"description" text,
	"address_street" text,
	"address_city" text,
	"address_district" text,
	"address_country" text,
	"address_postal_code" text,
	"address_lat" double precision,
	"address_lng" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "ntizo_provider"."provider_invite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"token" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_invite_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "ntizo_provider"."provider_member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ntizo_booking"."booking" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ntizo_user"."profile" ADD CONSTRAINT "profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "ntizo_user"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_provider"."provider" ADD CONSTRAINT "provider_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "ntizo_user"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_provider"."provider_invite" ADD CONSTRAINT "provider_invite_provider_id_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "ntizo_provider"."provider"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_provider"."provider_member" ADD CONSTRAINT "provider_member_provider_id_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "ntizo_provider"."provider"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_provider"."provider_member" ADD CONSTRAINT "provider_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "ntizo_user"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_booking"."booking" ADD CONSTRAINT "booking_customer_id_user_id_fk" FOREIGN KEY ("customer_id") REFERENCES "ntizo_user"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_invite_provider_email_uniq" ON "ntizo_provider"."provider_invite" USING btree ("provider_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_member_provider_user_uniq" ON "ntizo_provider"."provider_member" USING btree ("provider_id","user_id");