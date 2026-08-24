ALTER TABLE "ntizo_catalog"."service" DROP CONSTRAINT "service_buffer_range";--> statement-breakpoint
ALTER TABLE "ntizo_catalog"."service" DROP CONSTRAINT "service_slot_interval";--> statement-breakpoint
ALTER TABLE "ntizo_catalog"."service" DROP COLUMN "buffer_minutes";--> statement-breakpoint
ALTER TABLE "ntizo_catalog"."service" DROP COLUMN "slot_interval_minutes";