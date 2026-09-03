CREATE SCHEMA "ntizo_contact";
--> statement-breakpoint
CREATE TABLE "ntizo_contact"."contact_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"topic" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"message" text NOT NULL,
	"requester_user_id" text,
	"locale" text NOT NULL,
	"origin_path" text,
	"ip_address" text,
	"user_agent" text,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ntizo_contact"."contact_request" ADD CONSTRAINT "contact_request_requester_user_id_user_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "ntizo_user"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_contact"."contact_request" ADD CONSTRAINT "contact_request_resolved_by_user_id_user_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "ntizo_user"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_request_status_created_idx" ON "ntizo_contact"."contact_request" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "contact_request_ip_created_idx" ON "ntizo_contact"."contact_request" USING btree ("ip_address","created_at");--> statement-breakpoint
CREATE INDEX "contact_request_kind_idx" ON "ntizo_contact"."contact_request" USING btree ("kind");