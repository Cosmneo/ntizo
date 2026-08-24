CREATE SCHEMA "ntizo_scheduling";
--> statement-breakpoint
CREATE TABLE "ntizo_catalog"."service_member" (
	"service_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_member_service_id_member_id_pk" PRIMARY KEY("service_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "ntizo_scheduling"."member_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_availability_weekday_range" CHECK ("ntizo_scheduling"."member_availability"."weekday" BETWEEN 0 AND 6),
	CONSTRAINT "member_availability_minutes" CHECK ("ntizo_scheduling"."member_availability"."start_minute" >= 0 AND "ntizo_scheduling"."member_availability"."end_minute" <= 1440 AND "ntizo_scheduling"."member_availability"."end_minute" > "ntizo_scheduling"."member_availability"."start_minute")
);
--> statement-breakpoint
CREATE TABLE "ntizo_scheduling"."date_exception" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"on_date" date NOT NULL,
	"kind" text NOT NULL,
	"start_minute" integer,
	"end_minute" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "date_exception_shape" CHECK (("ntizo_scheduling"."date_exception"."kind" = 'closed' AND "ntizo_scheduling"."date_exception"."start_minute" IS NULL AND "ntizo_scheduling"."date_exception"."end_minute" IS NULL)
       OR ("ntizo_scheduling"."date_exception"."kind" = 'custom' AND "ntizo_scheduling"."date_exception"."start_minute" IS NOT NULL AND "ntizo_scheduling"."date_exception"."end_minute" IS NOT NULL
           AND "ntizo_scheduling"."date_exception"."start_minute" >= 0 AND "ntizo_scheduling"."date_exception"."end_minute" <= 1440 AND "ntizo_scheduling"."date_exception"."end_minute" > "ntizo_scheduling"."date_exception"."start_minute"))
);
--> statement-breakpoint
CREATE TABLE "ntizo_scheduling"."house_closure" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "house_closure_range" CHECK ("ntizo_scheduling"."house_closure"."to_date" >= "ntizo_scheduling"."house_closure"."from_date")
);
--> statement-breakpoint
ALTER TABLE "ntizo_provider"."provider" ADD COLUMN "timezone" text DEFAULT 'Africa/Maputo' NOT NULL;--> statement-breakpoint
ALTER TABLE "ntizo_catalog"."service" ADD COLUMN "buffer_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ntizo_catalog"."service" ADD COLUMN "slot_interval_minutes" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "ntizo_catalog"."service_member" ADD CONSTRAINT "service_member_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "ntizo_catalog"."service"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_catalog"."service_member" ADD CONSTRAINT "service_member_member_id_provider_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "ntizo_provider"."provider_member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_scheduling"."member_availability" ADD CONSTRAINT "member_availability_provider_id_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "ntizo_provider"."provider"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_scheduling"."member_availability" ADD CONSTRAINT "member_availability_member_id_provider_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "ntizo_provider"."provider_member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_scheduling"."date_exception" ADD CONSTRAINT "date_exception_provider_id_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "ntizo_provider"."provider"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_scheduling"."date_exception" ADD CONSTRAINT "date_exception_member_id_provider_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "ntizo_provider"."provider_member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ntizo_scheduling"."house_closure" ADD CONSTRAINT "house_closure_provider_id_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "ntizo_provider"."provider"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_member_member_idx" ON "ntizo_catalog"."service_member" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "member_availability_member_weekday_idx" ON "ntizo_scheduling"."member_availability" USING btree ("member_id","weekday");--> statement-breakpoint
CREATE INDEX "date_exception_member_date_idx" ON "ntizo_scheduling"."date_exception" USING btree ("member_id","on_date");--> statement-breakpoint
CREATE INDEX "house_closure_provider_range_idx" ON "ntizo_scheduling"."house_closure" USING btree ("provider_id","from_date","to_date");--> statement-breakpoint
ALTER TABLE "ntizo_catalog"."service" ADD CONSTRAINT "service_buffer_range" CHECK ("ntizo_catalog"."service"."buffer_minutes" BETWEEN 0 AND 480);--> statement-breakpoint
ALTER TABLE "ntizo_catalog"."service" ADD CONSTRAINT "service_slot_interval" CHECK ("ntizo_catalog"."service"."slot_interval_minutes" IN (15, 30, 60));