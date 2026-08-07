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
  out: `./src/modules/ntizo/infrastructure/migrations/${stage}`,
  dbCredentials: { url: urlByStage[stage] ?? "" },
} satisfies Config;
