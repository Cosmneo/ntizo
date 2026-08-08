import { Hono } from "hono";
import { getAuth, registerSignUpHook } from "@ntizo/backend/modules/better-auth";
import { bootstrapUser } from "@ntizo/backend/modules/ntizo/bounded-contexts/user";
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

// Bootstrap the user BC once at module scope; the sign-up hook below shares it.
const userBootstrap = bootstrapUser();

// Wire the sign-up hook so every new better-auth user gets a matching
// ntizo_user.profile row. The user BC's CreateProfile internal command
// owns the domain-side write.
registerSignUpHook((input) =>
  userBootstrap.useCases.internal.createUserOnSignUp.execute(input),
);

// GraphQL (private, session-authed). The user and provider BCs are served
// exclusively through this endpoint now — REST routers for both were
// deleted (provider in Phase 1B, user in Phase 2).
mountPrivateGraphql(app);

// Health check
app.get("/", (c) => c.json({ status: "ok", service: "ntizo-api" }));

export { app };
