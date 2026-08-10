CREATE TABLE "ntizo_provider"."provider_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"type" text NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" text,
	"content_type" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"uploaded_by_user_id" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by_user_id" text,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	"supersedes_id" uuid
);
--> statement-breakpoint
ALTER TABLE "ntizo_provider"."provider" ADD COLUMN "reverification_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ntizo_provider"."provider_document" ADD CONSTRAINT "provider_document_provider_id_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "ntizo_provider"."provider"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_provider"."provider_document" ADD CONSTRAINT "provider_document_uploaded_by_user_id_user_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "ntizo_user"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_provider"."provider_document" ADD CONSTRAINT "provider_document_reviewed_by_user_id_user_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "ntizo_user"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "provider_document_provider_idx" ON "ntizo_provider"."provider_document" USING btree ("provider_id","uploaded_at");--> statement-breakpoint
CREATE INDEX "provider_document_status_idx" ON "ntizo_provider"."provider_document" USING btree ("status","uploaded_at");