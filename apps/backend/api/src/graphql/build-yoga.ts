import { createOnionYoga } from "@cosmneo/onion-lasagna-yoga";
import { ConsoleLoggerAdapter } from "@ntizo/backend/shared/infra/logger";
import { MAX_DEPTH } from "./hardening";

const fallbackLogger = new ConsoleLoggerAdapter("error");

export interface BuildYogaOptions {
  readonly schema: unknown;
  readonly fields: Parameters<typeof createOnionYoga>[0]["fields"];
  readonly plugins: readonly unknown[];
  readonly createContext: (request: Request) => unknown | Promise<unknown>;
  readonly graphiql: boolean;
}

/** Single factory every GraphQL mount flows through. */
export function buildYoga(options: BuildYogaOptions) {
  return createOnionYoga({
    fields: options.fields,
    schema: options.schema as Parameters<typeof createOnionYoga>[0]["schema"],
    createContext: options.createContext as Parameters<
      typeof createOnionYoga
    >[0]["createContext"],
    plugins: options.plugins,
    maxDepth: MAX_DEPTH,
    onResolverError: (error: unknown, fieldKey: string) => {
      fallbackLogger.error(`GraphQL resolver error [${fieldKey}]`, {
        message: error instanceof Error ? error.message : String(error),
      });
    },
    yoga: { graphiql: options.graphiql },
  });
}
