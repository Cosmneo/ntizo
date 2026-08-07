import type { Config } from "drizzle-kit";
import { baseDrizzleConfig } from "./base.drizzle.config";

export const devDrizzleConfig: Config = {
  ...baseDrizzleConfig,
  out: "./src/modules/better-auth/infrastructure/migrations/dev",
  dbCredentials: {
    url: process.env["DEV_DB_URL"] ?? "",
  },
};
