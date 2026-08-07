/// <reference types="node" />
import type { Config } from "drizzle-kit";
import { devDrizzleConfig } from "./infrastructure/config/dev.drizzle.config";
import { qaDrizzleConfig } from "./infrastructure/config/qa.drizzle.config";
import { prodDrizzleConfig } from "./infrastructure/config/prod.drizzle.config";

const stage = (process.env["STAGE"] ?? "dev").toLowerCase();

const configByStage: Record<string, Config> = {
  dev: devDrizzleConfig,
  qa: qaDrizzleConfig,
  prod: prodDrizzleConfig,
};

export default (configByStage[stage] ?? devDrizzleConfig) satisfies Config;
