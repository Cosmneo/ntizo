CREATE TABLE "ntizo_provider"."wallet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"currency" text DEFAULT 'MZN' NOT NULL,
	"available_minor" bigint DEFAULT 0 NOT NULL,
	"pending_minor" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ntizo_provider"."wallet_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_id" uuid NOT NULL,
	"type" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"available_delta_minor" bigint DEFAULT 0 NOT NULL,
	"pending_delta_minor" bigint DEFAULT 0 NOT NULL,
	"currency" text NOT NULL,
	"balance_after_minor" bigint NOT NULL,
	"booking_id" uuid,
	"payout_id" uuid,
	"idempotency_key" text NOT NULL,
	"description" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ntizo_provider"."wallet" ADD CONSTRAINT "wallet_provider_id_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "ntizo_provider"."provider"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_provider"."wallet_entry" ADD CONSTRAINT "wallet_entry_wallet_id_wallet_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "ntizo_provider"."wallet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_provider_unique" ON "ntizo_provider"."wallet" USING btree ("provider_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_entry_idempotency_unique" ON "ntizo_provider"."wallet_entry" USING btree ("wallet_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "wallet_entry_wallet_idx" ON "ntizo_provider"."wallet_entry" USING btree ("wallet_id","occurred_at");--> statement-breakpoint
CREATE INDEX "wallet_entry_booking_idx" ON "ntizo_provider"."wallet_entry" USING btree ("booking_id");