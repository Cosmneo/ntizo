// Process-wide infra store. Simplified from flowzao's infra-store.
// Holds env bindings so modules (better-auth, db client) can read config.

import type { Stage } from "../config/stage-properties";

export interface InfraEnvBindings {
  STAGE: Stage;
  LOG_LEVEL: string;
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  RESEND_API_KEY: string;
  EMAIL_FROM: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  MICROSOFT_CLIENT_ID: string;
  MICROSOFT_CLIENT_SECRET: string;
}

class InfraStore {
  private env: InfraEnvBindings | undefined;

  setEnv(env: InfraEnvBindings) {
    this.env = env;
  }

  getEnv(): InfraEnvBindings {
    if (!this.env) {
      throw new Error(
        "[infra-store] env not initialized. Call infraStore.setEnv(...) before reading.",
      );
    }
    return this.env;
  }
}

export const infraStore = new InfraStore();
