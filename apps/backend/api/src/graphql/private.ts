import type { Hono } from "hono";
import { privateGraphqlSchema } from "@ntizo/backend/modules/ntizo/graphql/private-schema";
import {
  bootstrapProviderRead,
  createProviderReadHandlers,
} from "@ntizo/backend/modules/ntizo/read/provider";
import { createProviderWriteHandlers } from "@ntizo/backend/modules/ntizo/write/provider";
import { bootstrapProvider } from "@ntizo/backend/modules/ntizo/bounded-contexts/provider";
import { bootstrapProviderWorkflows } from "@ntizo/backend/modules/ntizo/orchestrations/workflows/provider";
import { bootstrapUser } from "@ntizo/backend/modules/ntizo/bounded-contexts/user";
import { buildYoga } from "./build-yoga";
import { buildHardeningPlugins } from "./hardening";
import { createGraphqlContext } from "./context-factory";
import { graphqlCorsFetch } from "./cors";
import type { AppBindings } from "../types";

/**
 * Built lazily and memoised for the isolate's lifetime so `c.env.STAGE` can be
 * read on first request. STAGE is constant per deployment, so this is safe.
 */
let yoga: ReturnType<typeof buildYoga> | undefined;

function getYoga(stage: string) {
  if (!yoga) {
    const providerRead = bootstrapProviderRead();
    const provider = bootstrapProvider();
    const user = bootstrapUser();
    const workflows = bootstrapProviderWorkflows({
      userInternal: {
        upgradeProfileToProvider: user.useCases.internal.upgradeProfileToProvider,
        revertProviderUpgrade: user.useCases.internal.revertProviderUpgrade,
      },
      providerInternal: {
        createProvider: provider.useCases.internal.createProvider,
        deactivateProvider: provider.useCases.internal.deactivateProvider,
      },
    });

    yoga = buildYoga({
      schema: privateGraphqlSchema,
      fields: [
        ...createProviderReadHandlers(providerRead.useCases),
        ...createProviderWriteHandlers({ provider, workflows }),
      ] as Parameters<typeof buildYoga>[0]["fields"],
      plugins: buildHardeningPlugins(stage),
      createContext: createGraphqlContext,
      graphiql: stage !== "prod",
    });
  }
  return yoga;
}

export function mountPrivateGraphql(app: Hono<{ Bindings: AppBindings }>) {
  app.all("/graphql", (c) => {
    const stage = c.env.STAGE ?? "local";
    return graphqlCorsFetch(c.req.raw, stage, (request) =>
      getYoga(stage).fetch(request),
    );
  });
}
