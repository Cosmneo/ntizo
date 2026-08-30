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
import {
  bootstrapCommunicationRead,
  createCommunicationReadHandlers,
} from "@ntizo/backend/modules/ntizo/read/communication";
import { createCommunicationWriteHandlers } from "@ntizo/backend/modules/ntizo/write/communication";
import { bootstrapCommunication } from "@ntizo/backend/modules/ntizo/bounded-contexts/communication";
import { createNotificationWriteHandlers } from "@ntizo/backend/modules/ntizo/write/notification";
import { bootstrapNotification } from "@ntizo/backend/modules/ntizo/bounded-contexts/notification";
import { createProviderWriteHandlers } from "@ntizo/backend/modules/ntizo/write/provider";
import { createCatalogWriteHandlers } from "@ntizo/backend/modules/ntizo/write/catalog";
import { bootstrapCatalog } from "@ntizo/backend/modules/ntizo/bounded-contexts/catalog";
import { createSchedulingWriteHandlers } from "@ntizo/backend/modules/ntizo/write/scheduling";
import { bootstrapScheduling } from "@ntizo/backend/modules/ntizo/bounded-contexts/scheduling";
import { createReviewWriteHandlers } from "@ntizo/backend/modules/ntizo/write/review";
import { bootstrapReview } from "@ntizo/backend/modules/ntizo/bounded-contexts/review";
import { createBookingWriteHandlers } from "@ntizo/backend/modules/ntizo/write/booking";
import { bootstrapBooking } from "@ntizo/backend/modules/ntizo/bounded-contexts/booking";
import { createUserWriteHandlers } from "@ntizo/backend/modules/ntizo/write/user";
import { bootstrapProvider } from "@ntizo/backend/modules/ntizo/bounded-contexts/provider";
import { bootstrapProviderWorkflows } from "@ntizo/backend/modules/ntizo/orchestrations/workflows/provider";
import { bootstrapUser } from "@ntizo/backend/modules/ntizo/bounded-contexts/user";
import { buildYoga } from "./build-yoga";
import { buildHardeningPlugins } from "./hardening";
import { createGraphqlContextFactory } from "./context-factory";
import { graphqlCorsFetch } from "./cors";
import { AttachmentStorageAdapter, runWithAttachmentsBucket } from "../attachment-storage.adapter";
import type { AppBindings } from "../types";

/**
 * The whole private-schema wiring: every read/write bounded context's
 * bootstrap, and the GraphQL fields built from them.
 *
 * Extracted out of `getYoga` (rather than inlined there, as it was through
 * Task 7) so a test can build this exact field list without going through
 * Hono, Wrangler, or a real request — see
 * `__tests__/schema-mount.test.ts`, which walks `privateGraphqlSchema`'s
 * leaf fields and asserts every one of them has a matching key here. A field
 * merged into `read/schema.ts` or `write/schema.ts` but never spread into
 * this array resolves to `null` with no error at request time — no test
 * failure, no boot failure, nothing — which is exactly how the notification
 * phase shipped eight such fields. This function existing as a single,
 * importable value is what makes that failure mode a red test instead of a
 * silent gap somebody has to notice by hand.
 *
 * Contains no `stage`/`c.env` dependency — every bootstrap here takes no
 * arguments (or only the internal use cases another bootstrap in this same
 * function exposes), so building this list has no side effect beyond
 * constructing plain adapter/use-case objects. Safe to call more than once.
 */
export function buildPrivateGraphQLFields(): {
  userRead: ReturnType<typeof bootstrapUserRead>;
  fields: Parameters<typeof buildYoga>[0]["fields"];
} {
  const providerRead = bootstrapProviderRead();
  const userRead = bootstrapUserRead();
  const provider = bootstrapProvider();
  const user = bootstrapUser();
  const catalogRead = bootstrapCatalogRead();
  const catalog = bootstrapCatalog();
  const scheduling = bootstrapScheduling();
  const review = bootstrapReview();
  const booking = bootstrapBooking();
  const walletRead = bootstrapWalletRead();
  // The eight notification fields are already in `privateGraphqlSchema` —
  // read/schema.ts and write/schema.ts merge them in. A field declared in
  // the schema with no handler behind it resolves to nothing, so leaving
  // these unmounted would put an inbox in the type the frontend generates
  // against and give it nothing to call.
  const notificationRead = bootstrapNotificationRead();
  const notification = bootstrapNotification();
  const activityRead = bootstrapActivityRead();
  const communicationRead = bootstrapCommunicationRead();
  const communication = bootstrapCommunication({
    raiseNotification: notification.useCases.internal.raiseNotification,
    // Reads the CURRENT request's `ATTACHMENTS_BUCKET` via
    // `runWithAttachmentsBucket` below at call time, not now — this
    // function runs once at module scope (see this file's own doc
    // comment), before any request, and therefore before any `c.env`,
    // exists.
    attachmentStorage: new AttachmentStorageAdapter(),
  });
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

  return {
    userRead,
    fields: [
      ...createProviderReadHandlers(providerRead.useCases),
      ...createUserReadHandlers(userRead.useCases),
      ...createCatalogReadHandlers(catalogRead.useCases),
      ...createWalletReadHandlers(walletRead.useCases),
      ...createSchedulingReadHandlers({ scheduling }),
      ...createNotificationReadHandlers({ notificationRead }),
      ...createActivityReadHandlers({ activityRead }),
      ...createCommunicationReadHandlers({ communicationRead }),
      ...createCommunicationWriteHandlers({ communication }),
      ...createProviderWriteHandlers({ provider, workflows }),
      ...createCatalogWriteHandlers({ catalog }),
      ...createSchedulingWriteHandlers({ scheduling }),
      ...createReviewWriteHandlers({ review }),
      ...createBookingWriteHandlers({ booking }),
      ...createNotificationWriteHandlers({ notification }),
      ...createUserWriteHandlers({
        updateMyProfile: user.useCases.updateMyProfile,
        addMyAddress: user.useCases.addMyAddress,
        updateMyAddress: user.useCases.updateMyAddress,
        deleteMyAddress: user.useCases.deleteMyAddress,
      }),
    ] as Parameters<typeof buildYoga>[0]["fields"],
  };
}

/**
 * Built lazily and memoised for the isolate's lifetime so `c.env.STAGE` can be
 * read on first request. STAGE is constant per deployment, so this is safe.
 */
let yoga: ReturnType<typeof buildYoga> | undefined;

function getYoga(stage: string) {
  if (!yoga) {
    const { userRead, fields } = buildPrivateGraphQLFields();

    yoga = buildYoga({
      schema: privateGraphqlSchema,
      fields,
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
    // Wraps the whole request — CORS included — so every resolver Yoga
    // invokes while handling it, `communication.send` among them, can see
    // this request's attachments bucket through `AttachmentStorageAdapter`,
    // however deep the call that needs it. See `runWithAttachmentsBucket`'s
    // own doc comment for why nothing shallower in this chain carries it.
    return runWithAttachmentsBucket(c.env.ATTACHMENTS_BUCKET, () =>
      graphqlCorsFetch(c.req.raw, stage, (request) => getYoga(stage).fetch(request)),
    );
  });
}
