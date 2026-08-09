/// <reference types="node" />
import type { Config } from "drizzle-kit";

const stage = (process.env["STAGE"] ?? "dev").toLowerCase();

const base: Config = {
  schema: "./src/modules/ntizo/shared/infrastructure/database/index.ts",
  dialect: "postgresql",
  schemaFilter: [
    "ntizo_user",
    "ntizo_provider",
    "ntizo_catalog",
    "ntizo_pricing",
    "ntizo_scheduling",
    "ntizo_booking",
    "ntizo_payment",
    "ntizo_communication",
    "ntizo_review",
    "ntizo_outbox",
  ],
  verbose: true,
  strict: true,
};

const urlByStage: Record<string, string | undefined> = {
  dev: process.env["DEV_DB_URL"],
  qa: process.env["QA_DB_URL"],
  prod: process.env["PROD_DB_URL"],
};

export default {
  ...base,
  // A migration describes how the schema evolved, not which environment it
  // runs against — so there is one migration chain per module, not one per
  // stage. Only the connection URL varies by stage; `out` must not.
  //
  // NOTE: this module and `better-auth/drizzle.config.ts` both write to the
  // default `drizzle.__drizzle_migrations` journal table. That only works
  // because drizzle applies any migration whose content hash is absent from
  // the journal, and the two chains' hashes have never collided. It is
  // coincidental, not designed — do not rely on it, and if you add a third
  // migration chain, give it its own `migrationsTable`.
  out: "./src/modules/ntizo/infrastructure/migrations",
  dbCredentials: { url: urlByStage[stage] ?? "" },
} satisfies Config;
