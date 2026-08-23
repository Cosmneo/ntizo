import { Hono } from "hono";
import { getAuth, registerSignUpHook } from "@ntizo/backend/modules/better-auth";
import { bootstrapUser } from "@ntizo/backend/modules/ntizo/bounded-contexts/user";
import { bootstrapNotification } from "@ntizo/backend/modules/ntizo/bounded-contexts/notification";
import {
  registerProviderNotificationHandlers,
  registerUserNotificationHandlers,
} from "@ntizo/backend/modules/ntizo/write/notification";
import { getEventRouter } from "@ntizo/backend/shared/infra/events";
import { mountPrivateGraphql } from "./graphql/private";
import { mountPublicGraphql } from "./graphql/public";
import { mountDocuments } from "./documents";
import { mountMedia } from "./media";
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
const notificationBootstrap = bootstrapNotification();
const eventRouter = getEventRouter();
registerProviderNotificationHandlers(eventRouter, {
  raiseNotification: notificationBootstrap.useCases.internal.raiseNotification,
  // The invite handler resolves the invitee itself, because
  // `provider.invite.sent` identifies them by an email address that may
  // belong to nobody yet.
  userByEmailReader: notificationBootstrap.adapters.userByEmailReader,
});
registerUserNotificationHandlers(eventRouter, {
  raiseNotification: notificationBootstrap.useCases.internal.raiseNotification,
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

// Health check
app.get("/", (c) => c.json({ status: "ok", service: "ntizo-api" }));

export { app };
