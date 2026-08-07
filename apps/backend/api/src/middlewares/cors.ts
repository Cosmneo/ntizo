import { cors } from "hono/cors";
import { getTrustedOrigins } from "@ntizo/backend/shared/infra/config";
import { infraStore } from "@ntizo/backend/shared/infra";

export const authCors = cors({
  origin: (origin) => {
    try {
      const allowed = getTrustedOrigins(infraStore.getEnv().STAGE);
      return allowed.includes(origin) ? origin : "";
    } catch {
      return "";
    }
  },
  credentials: true,
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
});
