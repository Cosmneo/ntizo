import type { Config } from "drizzle-kit";
import { baseDrizzleConfig } from "./base.drizzle.config";

export const prodDrizzleConfig: Config = {
  ...baseDrizzleConfig,
  out: "./src/modules/better-auth/infrastructure/migrations/prod",
  dbCredentials: {
    url: process.env["PROD_DB_URL"] ?? "",
  },
};
