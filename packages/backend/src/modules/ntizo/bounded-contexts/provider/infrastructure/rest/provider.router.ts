// REST router for the provider BC. Exposes CRUD + invite + member endpoints.
// Reads the ExecutionContext built by the api-level middleware.

import { Hono } from "hono";
import { inArray } from "drizzle-orm";
import type { ProviderBootstrap } from "../../bootstrap";
import type { ProviderWorkflowsBootstrap } from "../../../../orchestrations/workflows/provider/bootstrap";
import {
  type ExecutionContext,
  requireAuthenticated,
} from "../../../../shared/infrastructure/execution-context";
import { db } from "../../../../../better-auth/infrastructure/client/drizzle";
import { user as userTable } from "../../../../../better-auth/infrastructure/database/schema";

type Env = { Variables: { executionContext: ExecutionContext } };

export interface CreateProviderRouterDeps {
  providerBootstrap: ProviderBootstrap;
  workflowsBootstrap: ProviderWorkflowsBootstrap;
}

export function createProviderRouter(deps: CreateProviderRouterDeps) {
  const app = new Hono<Env>();
  const provider = deps.providerBootstrap;
  const workflows = deps.workflowsBootstrap;

  function requireAuth(ctx: ExecutionContext) {
    return ctx.requester.type === "authenticated";
  }

  // ---- providers --------------------------------------------------------

  app.post("/providers", async (c) => {
    const ctx = c.var.executionContext;
    if (!requireAuth(ctx)) return c.json({ error: "unauthenticated" }, 401);
    const body = (await c.req.json()) as {
      type: "individual" | "organization";
      name: string;
      slug: string;
      description?: string;
      address?: Record<string, unknown>;
    };
    try {
      const out = await provider.useCases.createProvider.execute(ctx, body);
      return c.json(out, 201);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.patch("/providers/:id", async (c) => {
    const ctx = c.var.executionContext;
    if (!requireAuth(ctx)) return c.json({ error: "unauthenticated" }, 401);
    const id = c.req.param("id");
    const body = (await c.req.json()) as {
      name?: string;
      description?: string;
      address?: Record<string, unknown>;
    };
    try {
      const out = await provider.useCases.updateProvider.execute(ctx, {
        providerId: id,
        ...body,
      });
      return c.json(out);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // ---- register-me workflow (cross-BC saga) -----------------------------

  app.post("/providers/register-me", async (c) => {
    const ctx = c.var.executionContext;
    if (!requireAuth(ctx)) return c.json({ error: "unauthenticated" }, 401);
    const body = (await c.req.json().catch(() => ({}))) as {
      name?: string;
      slug?: string;
    };
    try {
      const out = await workflows.useCases.registerUserAsProvider.execute({
        executionContext: ctx,
        input: { name: body.name, slug: body.slug },
      });
      return c.json(out, 201);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // ---- list my providers ------------------------------------------------

  app.get("/providers/mine", async (c) => {
    const ctx = c.var.executionContext;
    if (!requireAuth(ctx)) return c.json({ error: "unauthenticated" }, 401);
    try {
      const items = await provider.useCases.listMyProviders.execute(ctx);
      return c.json(items);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.post("/providers/:id/deactivate", async (c) => {
    const ctx = c.var.executionContext;
    if (!requireAuth(ctx)) return c.json({ error: "unauthenticated" }, 401);
    try {
      const out = await provider.useCases.deactivateProvider.execute(ctx, {
        providerId: c.req.param("id"),
      });
      return c.json(out);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.get("/providers/:id", async (c) => {
    const ctx = c.var.executionContext;
    if (!requireAuth(ctx)) return c.json({ error: "unauthenticated" }, 401);
    const id = c.req.param("id");
    const requester = requireAuthenticated(ctx);

    // Membership gate, matching the read-side isMember check. Return 404
    // (not 403) for non-members so we don't confirm the provider exists.
    const requesterMembership =
      await provider.adapters.providerMemberRepository.findByProviderAndUser(
        id,
        requester.userId,
      );
    if (!requesterMembership) return c.json({ error: "not found" }, 404);

    const found = await provider.adapters.providerRepository.findById(id);
    if (!found) return c.json({ error: "not found" }, 404);

    const [memberEntities, inviteEntities] = await Promise.all([
      provider.adapters.providerMemberRepository.findByProviderId(id),
      provider.adapters.providerInviteRepository.findByProviderId(id),
    ]);

    const userIds = Array.from(new Set(memberEntities.map((m) => m.userId)));
    const users = userIds.length
      ? await db
          .select({
            id: userTable.id,
            name: userTable.name,
            email: userTable.email,
          })
          .from(userTable)
          .where(inArray(userTable.id, userIds))
      : [];
    const userById = new Map(users.map((u) => [u.id, u]));

    return c.json({
      ...found.toJSON(),
      members: memberEntities.map((m) => {
        const u = userById.get(m.userId);
        return {
          userId: m.userId,
          email: u?.email ?? "",
          name: u?.name ?? null,
          role: m.role,
          joinedAt: m.joinedAt,
        };
      }),
      invites: inviteEntities.map((inv) => ({
        id: inv.id,
        email: inv.email,
        role: inv.role,
        status: inv.status,
      })),
    });
  });

  // ---- invites ----------------------------------------------------------

  app.post("/providers/:id/invites", async (c) => {
    const ctx = c.var.executionContext;
    if (!requireAuth(ctx)) return c.json({ error: "unauthenticated" }, 401);
    const body = (await c.req.json()) as {
      email: string;
      role: "admin" | "staff";
    };
    try {
      const out = await provider.useCases.inviteProviderMember.execute(ctx, {
        providerId: c.req.param("id"),
        ...body,
      });
      // `out` also carries `token`, the live invite secret — never put it on
      // the wire. Matches the projection done on the GraphQL side (see
      // mapProviderInviteSendOutput in write/provider/graphql/handlers).
      return c.json({ inviteId: out.inviteId }, 201);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.post("/providers/invites/:token/accept", async (c) => {
    const ctx = c.var.executionContext;
    if (!requireAuth(ctx)) return c.json({ error: "unauthenticated" }, 401);
    try {
      const out = await provider.useCases.acceptProviderInvite.execute(ctx, {
        token: c.req.param("token"),
      });
      return c.json(out);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.delete("/providers/:id/invites/:inviteId", async (c) => {
    const ctx = c.var.executionContext;
    if (!requireAuth(ctx)) return c.json({ error: "unauthenticated" }, 401);
    try {
      const out = await provider.useCases.revokeProviderInvite.execute(ctx, {
        providerId: c.req.param("id"),
        inviteId: c.req.param("inviteId"),
      });
      return c.json(out);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // ---- membership -------------------------------------------------------

  app.delete("/providers/:id/members/:userId", async (c) => {
    const ctx = c.var.executionContext;
    if (!requireAuth(ctx)) return c.json({ error: "unauthenticated" }, 401);
    try {
      const out = await provider.useCases.removeProviderMember.execute(ctx, {
        providerId: c.req.param("id"),
        userId: c.req.param("userId"),
      });
      return c.json(out);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.patch("/providers/:id/members/:userId/role", async (c) => {
    const ctx = c.var.executionContext;
    if (!requireAuth(ctx)) return c.json({ error: "unauthenticated" }, 401);
    const body = (await c.req.json()) as {
      role: "owner" | "admin" | "staff";
    };
    try {
      const out = await provider.useCases.updateProviderMemberRole.execute(
        ctx,
        {
          providerId: c.req.param("id"),
          userId: c.req.param("userId"),
          role: body.role,
        },
      );
      return c.json(out);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  return app;
}
