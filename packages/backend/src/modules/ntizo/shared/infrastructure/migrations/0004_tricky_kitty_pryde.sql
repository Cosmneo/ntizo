CREATE SCHEMA "ntizo_reference";
--> statement-breakpoint
CREATE TABLE "ntizo_reference"."city" (
	"geoname_id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"search_name" text NOT NULL,
	"country" text NOT NULL,
	"admin1" text,
	"population" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "city_country_population_idx" ON "ntizo_reference"."city" USING btree ("country","population");--> statement-breakpoint
CREATE INDEX "city_country_search_name_idx" ON "ntizo_reference"."city" USING btree ("country","search_name");