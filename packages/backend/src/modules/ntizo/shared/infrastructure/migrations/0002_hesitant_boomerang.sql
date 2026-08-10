CREATE TABLE "ntizo_user"."address" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"label" text NOT NULL,
	"country" text NOT NULL,
	"city" text NOT NULL,
	"district" text,
	"line1" text NOT NULL,
	"line2" text,
	"postal_code" text,
	"directions" text,
	"latitude" text,
	"longitude" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ntizo_user"."address" ADD CONSTRAINT "address_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "ntizo_user"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "address_user_id_idx" ON "ntizo_user"."address" USING btree ("user_id");