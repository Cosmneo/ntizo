CREATE TABLE "ntizo_user"."country_payment_method" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country" text NOT NULL,
	"type" text NOT NULL,
	"direction" text NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"sort_order" text DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ntizo_user"."payment_method" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"direction" text NOT NULL,
	"country" text NOT NULL,
	"identifier" text NOT NULL,
	"label" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ntizo_user"."payment_method" ADD CONSTRAINT "payment_method_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "ntizo_user"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "country_payment_method_country_idx" ON "ntizo_user"."country_payment_method" USING btree ("country","direction");--> statement-breakpoint
CREATE INDEX "payment_method_user_direction_idx" ON "ntizo_user"."payment_method" USING btree ("user_id","direction");