import type { InfraEnvBindings } from "@ntizo/backend/shared/infra";

/** Worker bindings = the infra env vars, supplied by wrangler vars + secrets. */
export type AppBindings = InfraEnvBindings;
