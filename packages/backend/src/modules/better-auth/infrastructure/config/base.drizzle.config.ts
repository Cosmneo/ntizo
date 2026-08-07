import type { Config } from "drizzle-kit";

export const baseDrizzleConfig: Config = {
  schema: "./src/modules/better-auth/infrastructure/database/schema.ts",
  dialect: "postgresql",
  schemaFilter: ["better_auth"],
  verbose: true,
  strict: true,
};
