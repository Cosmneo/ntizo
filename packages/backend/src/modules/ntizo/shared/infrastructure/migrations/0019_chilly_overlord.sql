DROP INDEX "ntizo_notification"."notification_user_idx";--> statement-breakpoint
DROP INDEX "ntizo_notification"."notification_provider_idx";--> statement-breakpoint
CREATE INDEX "notification_user_idx" ON "ntizo_notification"."notification" USING btree ("user_id","created_at" DESC NULLS LAST) WHERE "ntizo_notification"."notification"."user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "notification_provider_idx" ON "ntizo_notification"."notification" USING btree ("provider_id","created_at" DESC NULLS LAST) WHERE "ntizo_notification"."notification"."provider_id" IS NOT NULL;