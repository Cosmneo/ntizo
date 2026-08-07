// REST router for user BC. Exposes GET /me.
// Reads the ExecutionContext built by the api-level middleware.
//
// This router lives at the app layer (not in packages/backend) because it
// binds the user BC's use case to Hono — the framework adapter belongs
// here, not inside the framework-agnostic core package. `UserBootstrap` and
// `ExecutionContext` are imported as types only, so no framework or runtime
// value crosses the package boundary.

import { Hono } from "hono";
import type { UserBootstrap } from "@ntizo/backend/modules/ntizo/bounded-contexts/user";
import type { ExecutionContext } from "@ntizo/backend/modules/ntizo/shared/infrastructure/execution-context";

type Env = { Variables: { executionContext: ExecutionContext } };

export interface CreateUserRouterDeps {
  userBootstrap: UserBootstrap;
}

export function createUserRouter(deps: CreateUserRouterDeps) {
  const app = new Hono<Env>();
  const user = deps.userBootstrap;

  app.get("/me", async (c) => {
    const ctx = c.var.executionContext;
    if (ctx.requester.type !== "authenticated") {
      return c.json({ error: "unauthenticated" }, 401);
    }

    const dto = await user.useCases.getCurrentUser.execute(ctx);
    if (!dto) return c.json({ error: "not found" }, 404);
    return c.json(dto);
  });

  return app;
}
