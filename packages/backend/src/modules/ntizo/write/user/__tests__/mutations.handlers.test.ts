import { describe, expect, it } from "bun:test";
import type { NtizoGraphqlContext } from "../../../graphql/context";
import type { UpdateMyProfileInput } from "../../../bounded-contexts/user/app/ports/inbound/update-my-profile.command.port";
import type { ExecutionContext } from "../../../shared/infrastructure/execution-context";
import { toExecutionContext } from "../graphql/handlers/arg-mappers";
import { createUserWriteHandlers } from "../graphql/handlers/mutations.handlers";
import { updateMyProfile } from "../graphql/schema/mutations";

function ctx(overrides: Partial<NtizoGraphqlContext> = {}): NtizoGraphqlContext {
  return {
    requesterUserId: "u-session", email: "a@b.c", firstName: "A", lastName: "B",
    role: "customer",
    requestId: "r1", ipAddress: null, userAgent: null,
    ...overrides,
  };
}

describe("toExecutionContext", () => {
  it("carries the requester's real role, not a fabricated one", () => {
    const ec = toExecutionContext(ctx({ role: "admin" }));
    if (ec.requester.type !== "authenticated") throw new Error("unreachable");
    expect(ec.requester.user.platformRole).toBe("admin");
  });

  it("throws for an anonymous caller rather than fabricating an identity", () => {
    expect(() => toExecutionContext(ctx({ requesterUserId: null }))).toThrow();
  });
});

/**
 * The property that matters: this mutation edits the CALLER's profile and has
 * no way to name a different subject. The schema carries no `userId`, and the
 * handler passes the session-derived ExecutionContext — so even a caller that
 * smuggles a userId into the input cannot redirect the write.
 */
describe("createUserWriteHandlers", () => {
  it("passes the session identity to the use case, never anything from args", async () => {
    const seen: { userId: string; input: UpdateMyProfileInput }[] = [];
    const spy = {
      execute: async (ec: ExecutionContext, input: UpdateMyProfileInput) => {
        if (ec.requester.type !== "authenticated") throw new Error("unreachable");
        seen.push({ userId: ec.requester.user.userId, input });
      },
    };
    const handlers = createUserWriteHandlers({
        updateMyProfile: spy,
        // The address commands are not what this test exercises; they exist
        // so the module satisfies the handler builder, which refuses to
        // resolve at all when a declared field has no use case.
        addMyAddress: { execute: async () => ({ id: "a1" }) },
        updateMyAddress: { execute: async () => {} },
        deleteMyAddress: { execute: async () => {} },
      });

    // A hostile client's args. `handler(args, ctx)` receives the GraphQL
    // `input` value directly, and the kit exposes it as `args.input` alongside
    // the unvalidated `args.raw` — a smuggled key can only survive on `raw`,
    // since the input schema strips what it does not declare.
    await handlers[0]!.handler(
      { firstName: "New", userId: "victim", requestedByUserId: "victim" },
      ctx(),
    );

    expect(seen).toHaveLength(1);
    expect(seen[0]!.userId).toBe("u-session");
    expect(Object.keys(seen[0]!.input)).not.toContain("userId");
  });

  it("declares no way to name a different subject", () => {
    // Reading the published JSON Schema rather than a private field: it is the
    // kit's own stable surface, so this assertion survives a zod-internals
    // change that a `_schema.def.shape` reach would not.
    // `input` is optional on the kit's field type (a mutation may take none),
    // so assert its presence rather than reaching through it — an absent input
    // would mean this mutation accepts anything, which is worth failing on.
    expect(updateMyProfile.input).toBeDefined();
    const json = updateMyProfile.input!.toJsonSchema() as {
      properties?: Record<string, unknown>;
    };
    const fields = Object.keys(json.properties ?? {});
    expect(fields.length).toBeGreaterThan(0);
    expect(fields).not.toContain("userId");
    expect(fields).not.toContain("requestedByUserId");
  });
});
