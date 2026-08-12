CREATE TABLE "ntizo_catalog"."service" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"source_locale" text NOT NULL,
	"location_type" text NOT NULL,
	"booking_mode" text DEFAULT 'priced' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"image_keys" text[],
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ntizo_catalog"."service_option" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"pricing_mode" text DEFAULT 'fixed' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text DEFAULT 'MZN' NOT NULL,
	"duration_minutes" integer,
	"min_minutes" integer,
	"step_minutes" integer,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_option_amount_positive" CHECK ("ntizo_catalog"."service_option"."amount_minor" > 0),
	CONSTRAINT "service_option_mode_fields" CHECK ((
        "ntizo_catalog"."service_option"."pricing_mode" = 'fixed'
          AND "ntizo_catalog"."service_option"."duration_minutes" IS NOT NULL
          AND "ntizo_catalog"."service_option"."min_minutes" IS NULL AND "ntizo_catalog"."service_option"."step_minutes" IS NULL
      ) OR (
        "ntizo_catalog"."service_option"."pricing_mode" = 'hourly'
          AND "ntizo_catalog"."service_option"."duration_minutes" IS NULL
          AND "ntizo_catalog"."service_option"."min_minutes" IS NOT NULL AND "ntizo_catalog"."service_option"."step_minutes" IS NOT NULL
      )),
	CONSTRAINT "service_option_durations_positive" CHECK (("ntizo_catalog"."service_option"."duration_minutes" IS NULL OR "ntizo_catalog"."service_option"."duration_minutes" > 0)
        AND ("ntizo_catalog"."service_option"."min_minutes" IS NULL OR "ntizo_catalog"."service_option"."min_minutes" > 0)
        AND ("ntizo_catalog"."service_option"."step_minutes" IS NULL OR "ntizo_catalog"."service_option"."step_minutes" > 0))
);
--> statement-breakpoint
CREATE TABLE "ntizo_catalog"."service_option_translation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"option_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"name" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ntizo_catalog"."service_quote_form" (
	"service_id" uuid PRIMARY KEY NOT NULL,
	"response_hours" integer DEFAULT 48 NOT NULL,
	"ask_deadline" boolean DEFAULT true NOT NULL,
	"ask_photos" boolean DEFAULT true NOT NULL,
	"ask_location" boolean DEFAULT true NOT NULL,
	"intro" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ntizo_catalog"."service_translation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ntizo_catalog"."service" ADD CONSTRAINT "service_provider_id_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "ntizo_provider"."provider"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_catalog"."service" ADD CONSTRAINT "service_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "ntizo_catalog"."category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_catalog"."service_option" ADD CONSTRAINT "service_option_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "ntizo_catalog"."service"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_catalog"."service_option_translation" ADD CONSTRAINT "service_option_translation_option_id_service_option_id_fk" FOREIGN KEY ("option_id") REFERENCES "ntizo_catalog"."service_option"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_catalog"."service_quote_form" ADD CONSTRAINT "service_quote_form_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "ntizo_catalog"."service"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_catalog"."service_translation" ADD CONSTRAINT "service_translation_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "ntizo_catalog"."service"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_provider_order_idx" ON "ntizo_catalog"."service" USING btree ("provider_id","sort_order");--> statement-breakpoint
CREATE INDEX "service_status_category_idx" ON "ntizo_catalog"."service" USING btree ("status","category_id");--> statement-breakpoint
CREATE INDEX "service_option_service_order_idx" ON "ntizo_catalog"."service_option" USING btree ("service_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "service_option_one_default" ON "ntizo_catalog"."service_option" USING btree ("service_id") WHERE "ntizo_catalog"."service_option"."is_default";--> statement-breakpoint
CREATE UNIQUE INDEX "service_option_translation_unique" ON "ntizo_catalog"."service_option_translation" USING btree ("option_id","locale");--> statement-breakpoint
CREATE UNIQUE INDEX "service_translation_unique" ON "ntizo_catalog"."service_translation" USING btree ("service_id","locale");--> statement-breakpoint
CREATE INDEX "service_translation_locale_idx" ON "ntizo_catalog"."service_translation" USING btree ("locale");