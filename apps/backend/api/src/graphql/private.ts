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
import {
  bootstrapNotificationRead,
  createNotificationReadHandlers,
} from "@ntizo/backend/modules/ntizo/read/notification";
import {
  bootstrapActivityRead,
  createActivityReadHandlers,
} from "@ntizo/backend/modules/ntizo/read/activity";
import { createNotificationWriteHandlers } from "@ntizo/backend/modules/ntizo/write/notification";
import { bootstrapNotification } from "@ntizo/backend/modules/ntizo/bounded-contexts/notification";
import { createProviderWriteHandlers } from "@ntizo/backend/modules/ntizo/write/provider";
import { createCatalogWriteHandlers } from "@ntizo/backend/modules/ntizo/write/catalog";
import { bootstrapCatalog } from "@ntizo/backend/modules/ntizo/bounded-contexts/catalog";
import { createSchedulingWriteHandlers } from "@ntizo/backend/modules/ntizo/write/scheduling";
import { bootstrapScheduling } from "@ntizo/backend/modules/ntizo/bounded-contexts/scheduling";
import { createReviewWriteHandlers } from "@ntizo/backend/modules/ntizo/write/review";
import { bootstrapReview } from "@ntizo/backend/modules/ntizo/bounded-contexts/review";
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
    const review = bootstrapReview();
    const walletRead = bootstrapWalletRead();
    // The eight notification fields are already in `privateGraphqlSchema` —
    // read/schema.ts and write/schema.ts merge them in. A field declared in
    // the schema with no handler behind it resolves to nothing, so leaving
    // these unmounted would put an inbox in the type the frontend generates
    // against and give it nothing to call.
    const notificationRead = bootstrapNotificationRead();
    const notification = bootstrapNotification();
    const activityRead = bootstrapActivityRead();
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
        ...createNotificationReadHandlers({ notificationRead }),
        ...createActivityReadHandlers({ activityRead }),
        ...createProviderWriteHandlers({ provider, workflows }),
        ...createCatalogWriteHandlers({ catalog }),
        ...createSchedulingWriteHandlers({ scheduling }),
        ...createReviewWriteHandlers({ review }),
        ...createNotificationWriteHandlers({ notification }),
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
