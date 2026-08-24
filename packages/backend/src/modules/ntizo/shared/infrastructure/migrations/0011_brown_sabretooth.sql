CREATE SCHEMA "ntizo_catalog";
--> statement-breakpoint
CREATE TABLE "ntizo_catalog"."category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"image_key" text,
	"icon" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ntizo_catalog"."category_translation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ntizo_catalog"."category_translation" ADD CONSTRAINT "category_translation_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "ntizo_catalog"."category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "category_code_unique" ON "ntizo_catalog"."category" USING btree ("code");--> statement-breakpoint
CREATE INDEX "category_active_order_idx" ON "ntizo_catalog"."category" USING btree ("is_active","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "category_translation_unique" ON "ntizo_catalog"."category_translation" USING btree ("category_id","locale");--> statement-breakpoint
CREATE INDEX "category_translation_locale_idx" ON "ntizo_catalog"."category_translation" USING btree ("locale");