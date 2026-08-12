import { describe, expect, it } from "bun:test";
import { USER_ROLES, toUserRole } from "@ntizo/shared";
import { toExecutionContext } from "../graphql/handlers/arg-mappers";
import {
  createProviderWriteHandlers,
  mapProviderInviteAcceptOutput,
  mapProviderInviteSendOutput,
  type ProviderWriteModule,
} from "../graphql/handlers/mutations.handlers";

describe("toExecutionContext", () => {
  it("builds an authenticated ExecutionContext from the graphql context", () => {
    const ec = toExecutionContext({
      requesterUserId: "u1", email: "a@b.c", firstName: "A", lastName: "B",
      role: "customer",
      requestId: "r1", ipAddress: "1.2.3.4", userAgent: "ua",
    });
    expect(ec.requester.type).toBe("authenticated");
    if (ec.requester.type !== "authenticated") throw new Error("unreachable");
    expect(ec.requester.user.userId).toBe("u1");
    expect(ec.metadata.requestId).toBe("r1");
  });

  it("throws for an anonymous caller rather than fabricating an identity", () => {
    expect(() =>
      toExecutionContext({
        requesterUserId: null, email: null, firstName: null, lastName: null,
        role: "customer",
        requestId: null, ipAddress: null, userAgent: null,
      }),
    ).toThrow();
  });

  // Regression: platformRole was hardcoded to "customer" here, so an admin
  // reached every write use-case indistinguishable from a customer. The first
  // `if (platformRole === "admin")` written against this would have been dead
  // code, failing open in the silent direction.
  for (const role of USER_ROLES) {
    it(`carries the requester's real role through: ${role}`, () => {
      const ec = toExecutionContext({
        requesterUserId: "u1", email: "a@b.c", firstName: "A", lastName: "B",
        role,
        requestId: "r1", ipAddress: null, userAgent: null,
      });
      if (ec.requester.type !== "authenticated") throw new Error("unreachable");
      expect(ec.requester.user.platformRole).toBe(role);
    });
  }
});

describe("toUserRole", () => {
  for (const role of USER_ROLES) {
    it(`passes a known role through unchanged: ${role}`, () => {
      expect(toUserRole(role)).toBe(role);
    });
  }

  // The `role` column is free `text` with no CHECK and no enum, and better-auth
  // declares the field as a plain string — so these values really can be stored.
  // Every one must degrade to the least-privileged role, never widen.
  const hostile: ReadonlyArray<readonly [string, unknown]> = [
    ["unknown string", "superuser"],
    ["empty string", ""],
    ["wrong case", "ADMIN"],
    ["whitespace-padded admin", " admin "],
    ["null", null],
    ["undefined", undefined],
    ["number", 1],
    ["object", { role: "admin" }],
    ["array", ["admin"]],
  ];

  for (const [label, value] of hostile) {
    it(`degrades ${label} to customer`, () => {
      expect(toUserRole(value)).toBe("customer");
    });
  }
});

describe("mapProviderInviteSendOutput", () => {
  it("returns exactly { inviteId, emailSent } — the invite token is never projected through", () => {
    const projected = mapProviderInviteSendOutput({
      inviteId: "inv-1",
      token: "super-secret-invite-token",
      emailSent: true,
    });

    // `toEqual` already fails on an extra key (verified: bun:test's toEqual
    // is a strict deep-equal, not a partial/subset match), so this alone
    // would catch a future refactor that reinstates pass-through (e.g.
    // `return result;`). The explicit key-set and `in` checks below assert
    // the absence directly, so the failure reason is unambiguous rather than
    // relying on toEqual's mismatch diff.
    expect(projected).toEqual({ inviteId: "inv-1", emailSent: true });
    expect(Object.keys(projected).sort()).toEqual(["emailSent", "inviteId"]);
    expect("token" in projected).toBe(false);
  });

  it("carries a failed send through rather than swallowing it", () => {
    // The invite row exists either way. This is the only signal the caller
    // has that nobody was actually told about it.
    expect(
      mapProviderInviteSendOutput({
        inviteId: "inv-1",
        token: "t",
        emailSent: false,
      }).emailSent,
    ).toBe(false);
  });
});

describe("mapProviderInviteAcceptOutput", () => {
  it("returns exactly { providerId } — the accepting member's id is never projected through", () => {
    const projected = mapProviderInviteAcceptOutput({
      providerId: "prov-1",
      memberId: "mem-1",
    });

    expect(projected).toEqual({ providerId: "prov-1" });
    expect(Object.keys(projected).sort()).toEqual(["providerId"]);
    expect("memberId" in projected).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// provider.members.remove — the wire response, not just the use case.
//
// `RemoveProviderMemberCommand` has always computed `unpublishedServices`
// (see `service-members.test.ts`), and `catalog-unpublish-sweep.test.ts`
// covers the DB-backed sweep. Neither ever calls the GraphQL mutation and
// reads its actual response — which is exactly how a handler that discarded
// the field (`return { ok: true as const }`) shipped and passed every
// existing test. These two build the real schema-bound field via
// `createProviderWriteHandlers` and call its `.handler(...)` the same way
// the framework adapter does (`field.handler(args.input, context)`), so a
// regression here has to break the same path a real request takes.
// ---------------------------------------------------------------------------

describe("provider.members.remove — the response carries unpublishedServices", () => {
  function buildRemoveField(unpublishedServices: { serviceId: string; name: string }[]) {
    const mod = {
      provider: {
        useCases: {
          removeProviderMember: {
            execute: async () => ({
              providerId: "prov-1",
              userId: "user-2",
              unpublishedServices,
            }),
          },
        },
      },
      workflows: {},
      // Only `provider.useCases.removeProviderMember` is exercised by the
      // field this test calls — every other use case on the real
      // `ProviderBootstrap`/`ProviderWorkflowsBootstrap` is never touched at
      // runtime, so a full instantiation would only add ceremony.
    } as unknown as ProviderWriteModule;

    const fields = createProviderWriteHandlers(mod);
    const field = fields.find((f) => f.key === "provider.members.remove");
    if (!field) throw new Error('no handler registered for "provider.members.remove"');
    return field;
  }

  const rawContext = {
    requesterUserId: "owner-1",
    email: "owner@ntizo.test",
    firstName: "Owner",
    lastName: "One",
    role: "customer",
    requestId: "req-1",
    ipAddress: null,
    userAgent: null,
  };

  it("names the service back when the removed member was its last performer", async () => {
    const field = buildRemoveField([{ serviceId: "s1", name: "Corte T16" }]);

    const result = await field.handler(
      { providerId: "prov-1", userId: "user-2" },
      rawContext,
    );

    expect(result).toEqual({
      ok: true,
      unpublishedServices: [{ serviceId: "s1", name: "Corte T16" }],
    });
  });

  // Not just "the field is present" — it has to reflect what actually
  // happened. A handler that always attaches the same non-empty list (e.g.
  // every service on the provider, not only the ones this removal actually
  // unpublished) would still pass the test above; this is what catches that.
  it("is empty when the removed member was not the service's last performer", async () => {
    const field = buildRemoveField([]);

    const result = await field.handler(
      { providerId: "prov-1", userId: "user-2" },
      rawContext,
    );

    expect(result).toEqual({ ok: true, unpublishedServices: [] });
  });
});
