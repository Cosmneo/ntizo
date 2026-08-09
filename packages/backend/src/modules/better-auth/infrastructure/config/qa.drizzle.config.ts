import type { Config } from "drizzle-kit";
import { baseDrizzleConfig } from "./base.drizzle.config";

export const qaDrizzleConfig: Config = {
  ...baseDrizzleConfig,
  dbCredentials: {
    url: process.env["QA_DB_URL"] ?? "",
  },
};
