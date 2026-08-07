import type { Config } from "drizzle-kit";
import { baseDrizzleConfig } from "./base.drizzle.config";

export const qaDrizzleConfig: Config = {
  ...baseDrizzleConfig,
  out: "./src/modules/better-auth/infrastructure/migrations/qa",
  dbCredentials: {
    url: process.env["QA_DB_URL"] ?? "",
  },
};
