import type { Hono } from "hono";
import { privateGraphqlSchema } from "@ntizo/backend/modules/ntizo/graphql/private-schema";
import {
  bootstrapProviderRead,
  createProviderReadHandlers,
} from "@ntizo/backend/modules/ntizo/read/provider";
import {
  bootstrapUserRead,
  createUserReadHandlers,
} from "@ntizo/backend/modules/ntizo/read/user";
import {
  bootstrapCatalogRead,
  createCatalogReadHandlers,
} from "@ntizo/backend/modules/ntizo/read/catalog";
import {
  bootstrapWalletRead,
  createWalletReadHandlers,
} from "@ntizo/backend/modules/ntizo/read/wallet";
import { createSchedulingReadHandlers } from "@ntizo/backend/modules/ntizo/read/scheduling";
import { createProviderWriteHandlers } from "@ntizo/backend/modules/ntizo/write/provider";
import { createCatalogWriteHandlers } from "@ntizo/backend/modules/ntizo/write/catalog";
import { bootstrapCatalog } from "@ntizo/backend/modules/ntizo/bounded-contexts/catalog";
import { createSchedulingWriteHandlers } from "@ntizo/backend/modules/ntizo/write/scheduling";
import { bootstrapScheduling } from "@ntizo/backend/modules/ntizo/bounded-contexts/scheduling";
import { createUserWriteHandlers } from "@ntizo/backend/modules/ntizo/write/user";
import { bootstrapProvider } from "@ntizo/backend/modules/ntizo/bounded-contexts/provider";
import { bootstrapProviderWorkflows } from "@ntizo/backend/modules/ntizo/orchestrations/workflows/provider";
import { bootstrapUser } from "@ntizo/backend/modules/ntizo/bounded-contexts/user";
import { buildYoga } from "./build-yoga";
import { buildHardeningPlugins } from "./hardening";
import { createGraphqlContextFactory } from "./context-factory";
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
    const userRead = bootstrapUserRead();
    const provider = bootstrapProvider();
    const user = bootstrapUser();
    const catalogRead = bootstrapCatalogRead();
    const catalog = bootstrapCatalog();
    const scheduling = bootstrapScheduling();
    const walletRead = bootstrapWalletRead();
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
        ...createUserReadHandlers(userRead.useCases),
        ...createCatalogReadHandlers(catalogRead.useCases),
        ...createWalletReadHandlers(walletRead.useCases),
        ...createSchedulingReadHandlers({ scheduling }),
        ...createProviderWriteHandlers({ provider, workflows }),
        ...createCatalogWriteHandlers({ catalog }),
        ...createSchedulingWriteHandlers({ scheduling }),
        ...createUserWriteHandlers({
            updateMyProfile: user.useCases.updateMyProfile,
            addMyAddress: user.useCases.addMyAddress,
            updateMyAddress: user.useCases.updateMyAddress,
            deleteMyAddress: user.useCases.deleteMyAddress,
          }),
      ] as Parameters<typeof buildYoga>[0]["fields"],
      plugins: buildHardeningPlugins(stage),
      createContext: createGraphqlContextFactory({
        userRead: userRead.adapters.userReadRepository,
      }),
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
