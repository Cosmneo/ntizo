import { Hono } from "hono";
import { getAuth, registerSignUpHook } from "@ntizo/backend/modules/better-auth";
import { bootstrapUser } from "@ntizo/backend/modules/ntizo/bounded-contexts/user";
import { bootstrapNotification } from "@ntizo/backend/modules/ntizo/bounded-contexts/notification";
import { bootstrapActivity } from "@ntizo/backend/modules/ntizo/bounded-contexts/activity";
import { bootstrapCommunication } from "@ntizo/backend/modules/ntizo/bounded-contexts/communication";
import {
  registerProviderNotificationHandlers,
  registerUserNotificationHandlers,
} from "@ntizo/backend/modules/ntizo/write/notification";
import {
  registerCatalogActivityHandlers,
  registerProviderActivityHandlers,
  registerReviewActivityHandlers,
  registerUserActivityHandlers,
} from "@ntizo/backend/modules/ntizo/write/activity";
import { getEventRouter } from "@ntizo/backend/shared/infra/events";
import { mountPrivateGraphql } from "./graphql/private";
import { mountPublicGraphql } from "./graphql/public";
import { mountDocuments } from "./documents";
import { mountMedia } from "./media";
import { mountAttachments } from "./attachments";
import { AttachmentStorageAdapter } from "./attachment-storage.adapter";
import { mountWebhooks } from "./webhooks";
import { configureMediaUrlBase } from "@ntizo/backend/modules/ntizo/media";
import "./bootstrap";
import { configMiddleware } from "./middlewares/config.middleware";
import { authCors } from "./middlewares/cors";
import type { AppBindings } from "./types";

const app = new Hono<{ Bindings: AppBindings }>();

app.use("*", configMiddleware);

// `MEDIA_PUBLIC_URL_BASE` is a per-request binding, and the read tier composes
// image URLs from it. Captured here because a repository cannot reach `c.env`.
//
// The second argument is this API's own `/api/media` prefix, used when no
// public base is configured — which is every local run. Without it `mediaUrl`
// returned null, and the read projections drop keys whose URL is null, so a
// provider's uploaded images simply vanished from their own screen. This
// route already streams the bucket; only its address was missing.
app.use("*", async (c, next) => {
  configureMediaUrlBase(
    c.env.MEDIA_PUBLIC_URL_BASE,
    `${new URL(c.req.url).origin}/api/media`,
  );
  await next();
});
// Bootstrapped here rather than beside the event-handler registration below,
// because the webhook mount on the next line needs it and that mount has to be
// registered before `authCors` — see mountWebhooks. One instance for the
// isolate, shared by both, the same way `userBootstrap` is shared with the
// sign-up hook.
const notificationBootstrap = bootstrapNotification();

// Bootstrapped here too, at module scope beside `notificationBootstrap`: the
// attachment download route below needs `attachmentRepository.findVisible`
// directly, the same reason `admin-access.ts` and `provider-access.ts` reach
// other contexts' read repositories rather than a use case — see
// `bootstrapCommunication`'s own doc comment for why that adapter is exposed
// at all. `raiseNotification` is required only because the same bootstrap
// also wires `NotifyUnreadInternalCommand`, which this mount never calls —
// `attachmentStorage` likewise, because `bootstrapCommunication` always
// wires `SendMessageCommand`, even though nothing routed through THIS
// instance ever calls it either (the GraphQL write mutations use a separate
// instance — see `graphql/private.ts`).
const communicationBootstrap = bootstrapCommunication({
  raiseNotification: notificationBootstrap.useCases.internal.raiseNotification,
  attachmentStorage: new AttachmentStorageAdapter(),
});

// Bootstrapped here too, at module scope beside `notificationBootstrap`: the
// activity handlers registered below need `recordActivity` and the two
// cross-BC name readers, and this is the one instance for the isolate.
const activityBootstrap = bootstrapActivity();

// Inbound provider callbacks (Resend's bounce and complaint webhook).
//
// Registered BEFORE `authCors`, and the order is load-bearing: Hono composes
// matching handlers in registration order, so a route registered after that
// line runs the CORS middleware and one registered before it does not. A
// webhook is a server-to-server POST with no origin; `authCors` polices
// browsers. `configMiddleware` above still wraps it, because the suppression
// write needs the request-scoped infra store.
mountWebhooks(app, {
  handleResendWebhook: notificationBootstrap.useCases.internal.handleResendWebhook,
});

app.use("/api/*", authCors);
// /graphql's own CORS enforcement lives inside mountPrivateGraphql
// (graphql/cors.ts) rather than as a Hono middleware here — Yoga's bundled
// default CORS plugin builds its own Response inside `fetch()`, which a
// wrapping Hono middleware cannot correct after the fact. See graphql/cors.ts
// for why, and for the origin allowlist shared with authCors.

app.on(["POST", "GET"], "/api/auth/*", (c) => getAuth().handler(c.req.raw));

// Bootstrap the user BC once at module scope; the sign-up hook below shares it.
const userBootstrap = bootstrapUser();

// Wire the sign-up hook so every new better-auth user gets a matching
// ntizo_user.profile row. The user BC's CreateProfile internal command
// owns the domain-side write.
registerSignUpHook((input) =>
  userBootstrap.useCases.internal.createUserOnSignUp.execute(input),
);

// Who reacts to whose events is wired here, at the app layer, for the same
// reason every adapter choice is: this is the only place allowed to know that
// the Provider and User contexts produce events the Notification context turns
// into inbox rows. Neither producing context imports the consumer — they
// publish, and the router decides who hears it.
//
// At module scope, not per request: the router is a singleton for the isolate
// (see `getEventRouter`), and this must have run before the first sign-up,
// which is the first thing that dispatches. Registering per request would add
// a second copy of every handler on every request.
//
// `notificationBootstrap` itself is constructed further up, beside the webhook
// mount that also needs it.
const eventRouter = getEventRouter();
registerProviderNotificationHandlers(eventRouter, {
  raiseNotification: notificationBootstrap.useCases.internal.raiseNotification,
  // The invite handler resolves the invitee itself, because
  // `provider.invite.sent` identifies them by an email address that may
  // belong to nobody yet.
  userByEmailReader: notificationBootstrap.adapters.userByEmailReader,
  // Same handler snapshots the workspace's name, because that row lands in
  // a personal inbox rather than the workspace's own.
  providerNameReader: notificationBootstrap.adapters.providerNameReader,
});
registerUserNotificationHandlers(eventRouter, {
  raiseNotification: notificationBootstrap.useCases.internal.raiseNotification,
});

// Same router, a second, independent set of listeners: nine of the Provider,
// User, Catalog and Review contexts' events also turn into a row in the
// acting person's own history. Neither producing context, and neither the
// notification handlers above, know this consumer exists — this is still
// the only place allowed to know it does.
//
// This line is the one a compiler cannot miss for you: deleting any one of
// these four calls breaks nothing that builds or that a handler's own unit
// test would catch — every producer keeps publishing, every handler test
// keeps passing, and the only symptom is a history that is silently always
// empty. `event-handler-registration.test.ts` (and its activity-focused
// sibling) exist to catch exactly that.
registerProviderActivityHandlers(eventRouter, {
  recordActivity: activityBootstrap.useCases.internal.recordActivity,
  providerNameReader: activityBootstrap.adapters.providerNameReader,
});
registerUserActivityHandlers(eventRouter, {
  recordActivity: activityBootstrap.useCases.internal.recordActivity,
});
registerCatalogActivityHandlers(eventRouter, {
  recordActivity: activityBootstrap.useCases.internal.recordActivity,
  serviceNameReader: activityBootstrap.adapters.serviceNameReader,
});
registerReviewActivityHandlers(eventRouter, {
  recordActivity: activityBootstrap.useCases.internal.recordActivity,
});

// GraphQL (private, session-authed). The user and provider BCs are served
// exclusively through this endpoint now — REST routers for both were
// deleted (provider in Phase 1B, user in Phase 2).
mountPrivateGraphql(app);

// PUBLIC — anonymous listings, its own Yoga and its own CORS posture. Mounted
// separately from /graphql on purpose: that endpoint reflects only trusted
// origins WITH credentials, which a crawler can never satisfy; loosening it to
// serve public pages would widen the session-bearing surface instead.
mountPublicGraphql(app);

// Identity documents. Its own mount: multipart in, bytes out — neither of
// which GraphQL carries well.
mountDocuments(app);

// Logos and portfolio photos. Public-read, unlike documents.
mountMedia(app);

// Message attachments. Private like documents, never public like media: a
// file here always arrived from a stranger.
mountAttachments(app, {
  attachmentRepository: communicationBootstrap.adapters.attachmentRepository,
});

// Health check
app.get("/", (c) => c.json({ status: "ok", service: "ntizo-api" }));

export { app };
