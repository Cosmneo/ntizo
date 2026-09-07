CREATE SCHEMA "ntizo_favourite";
--> statement-breakpoint
CREATE TABLE "ntizo_favourite"."favourite_list" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" varchar(60),
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favourite_list_id_user_uq" UNIQUE("id","user_id")
);
--> statement-breakpoint
CREATE TABLE "ntizo_favourite"."favourite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"target_type" varchar(16) NOT NULL,
	"target_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favourite_list_target_uq" UNIQUE("list_id","target_type","target_id")
);
--> statement-breakpoint
ALTER TABLE "ntizo_favourite"."favourite" ADD CONSTRAINT "favourite_list_owner_fk" FOREIGN KEY ("list_id","user_id") REFERENCES "ntizo_favourite"."favourite_list"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "favourite_list_user_name_uq" ON "ntizo_favourite"."favourite_list" USING btree ("user_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "favourite_list_one_default_uq" ON "ntizo_favourite"."favourite_list" USING btree ("user_id") WHERE "ntizo_favourite"."favourite_list"."is_default";--> statement-breakpoint
CREATE INDEX "favourite_list_user_created_idx" ON "ntizo_favourite"."favourite_list" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "favourite_list_created_idx" ON "ntizo_favourite"."favourite" USING btree ("list_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "favourite_user_target_idx" ON "ntizo_favourite"."favourite" USING btree ("user_id","target_type","target_id");