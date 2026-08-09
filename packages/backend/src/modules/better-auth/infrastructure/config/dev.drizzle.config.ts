import type { Config } from "drizzle-kit";
import { baseDrizzleConfig } from "./base.drizzle.config";

export const devDrizzleConfig: Config = {
  ...baseDrizzleConfig,
  dbCredentials: {
    url: process.env["DEV_DB_URL"] ?? "",
  },
};
