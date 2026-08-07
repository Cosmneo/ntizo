import { Hono } from "hono";
import { getAuth, registerSignUpHook } from "@ntizo/backend/modules/better-auth";
import { bootstrapUser } from "@ntizo/backend/modules/ntizo/bounded-contexts/user";
import { createUserRouter } from "./http/user.router";
import { mountPrivateGraphql } from "./graphql/private";
import "./bootstrap";
import { configMiddleware } from "./middlewares/config.middleware";
import { authCors } from "./middlewares/cors";
import { executionContextMiddleware } from "./middlewares/execution-context.middleware";
import type { AppBindings } from "./types";

const app = new Hono<{ Bindings: AppBindings }>();

app.use("*", configMiddleware);
app.use("/api/*", authCors);
// /graphql's own CORS enforcement lives inside mountPrivateGraphql
// (graphql/cors.ts) rather than as a Hono middleware here — Yoga's bundled
// default CORS plugin builds its own Response inside `fetch()`, which a
// wrapping Hono middleware cannot correct after the fact. See graphql/cors.ts
// for why, and for the origin allowlist shared with authCors.

// Better-auth handler runs BEFORE execution-context middleware so
// login/signup/callback endpoints don't re-resolve their own session.
app.on(["POST", "GET"], "/api/auth/*", (c) => getAuth().handler(c.req.raw));

// Every domain endpoint gets a fresh ExecutionContext attached.
app.use("/api/*", executionContextMiddleware);

// Bootstrap the user BC once at module scope; the router below shares it.
const userBootstrap = bootstrapUser();

// Wire the sign-up hook so every new better-auth user gets a matching
// ntizo_user.profile row. The user BC's CreateProfile internal command
// owns the domain-side write.
registerSignUpHook((input) =>
  userBootstrap.useCases.internal.createUserOnSignUp.execute(input),
);

// Ntizo user BC router — exposes GET /me. There is no read/user GraphQL
// slice yet, so this REST router stays mounted.
app.route("/api", createUserRouter({ userBootstrap }));

// GraphQL (private, session-authed). The provider BC is served exclusively
// through this endpoint now — its REST router was deleted in Phase 1B.
mountPrivateGraphql(app);

// Health check
app.get("/", (c) => c.json({ status: "ok", service: "ntizo-api" }));

export { app };
