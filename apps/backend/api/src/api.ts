import { Hono } from "hono";
import { getAuth, registerSignUpHook } from "@ntizo/backend/modules/better-auth";
import { createUserRouter } from "@ntizo/backend/modules/ntizo/bounded-contexts/user/router";
import { createProviderRouter } from "@ntizo/backend/modules/ntizo/bounded-contexts/provider/router";
import { bootstrapUser } from "@ntizo/backend/modules/ntizo/bounded-contexts/user";
import { bootstrapProvider } from "@ntizo/backend/modules/ntizo/bounded-contexts/provider";
import { bootstrapProviderWorkflows } from "@ntizo/backend/modules/ntizo/orchestrations/workflows/provider";
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

// Bootstrap each BC exactly once at module scope, then share the instances
// across all routers so we never instantiate duplicate drizzle repositories.
const userBootstrap = bootstrapUser();
const providerBootstrap = bootstrapProvider();

// Wire the sign-up hook so every new better-auth user gets a matching
// ntizo_user.profile row. The user BC's CreateProfile internal command
// owns the domain-side write.
registerSignUpHook((input) =>
  userBootstrap.useCases.internal.createUserOnSignUp.execute(input),
);
const workflowsBootstrap = bootstrapProviderWorkflows({
  userInternal: {
    upgradeProfileToProvider:
      userBootstrap.useCases.internal.upgradeProfileToProvider,
    revertProviderUpgrade:
      userBootstrap.useCases.internal.revertProviderUpgrade,
  },
  providerInternal: {
    createProvider: providerBootstrap.useCases.internal.createProvider,
    deactivateProvider: providerBootstrap.useCases.internal.deactivateProvider,
  },
});

// Ntizo user BC router — exposes GET /me.
app.route("/api", createUserRouter({ userBootstrap }));

// Ntizo provider BC router — exposes provider CRUD + invites + members.
app.route(
  "/api",
  createProviderRouter({ providerBootstrap, workflowsBootstrap }),
);

// GraphQL (private, session-authed). REST stays live until Plan 1B.
mountPrivateGraphql(app);

// Health check
app.get("/", (c) => c.json({ status: "ok", service: "ntizo-api" }));

export { app };
