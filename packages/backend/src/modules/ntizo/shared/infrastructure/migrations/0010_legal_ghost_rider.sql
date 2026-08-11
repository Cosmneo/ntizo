CREATE SCHEMA "ntizo_platform";
--> statement-breakpoint
CREATE TABLE "ntizo_platform"."platform_settings" (
	"id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
	"default_commission_bps" integer DEFAULT 1000 NOT NULL,
	"min_service_price_minor" bigint DEFAULT 5000 NOT NULL,
	"min_payout_minor" bigint DEFAULT 10000 NOT NULL,
	"earnings_hold_days" integer DEFAULT 3 NOT NULL,
	"auto_approve_providers" boolean DEFAULT false NOT NULL,
	"invite_ttl_days" integer DEFAULT 7 NOT NULL,
	"require_documents_to_publish" boolean DEFAULT true NOT NULL,
	"max_portfolio_photos" integer DEFAULT 24 NOT NULL,
	"max_image_bytes" integer DEFAULT 5242880 NOT NULL,
	"max_document_bytes" integer DEFAULT 10485760 NOT NULL,
	"support_email" text DEFAULT '' NOT NULL,
	"support_phone" text DEFAULT '' NOT NULL,
	"provider_registration_open" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ntizo_platform"."settings_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"target_id" uuid,
	"field" text NOT NULL,
	"previous_value" text,
	"new_value" text,
	"actor_user_id" text NOT NULL,
	"reason" text,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
