import { describe, expect, it } from "bun:test";
import type { NtizoGraphqlContext } from "../../../graphql/context";
import type { ListContactRequestsForAdminQuery } from "../../../bounded-contexts/contact/app/use-cases/list-contact-requests-for-admin.query";
import { createContactReadHandlers } from "../graphql/handlers/queries.handlers";

function ctx(overrides: Partial<NtizoGraphqlContext> = {}): NtizoGraphqlContext {
  return {
    requesterUserId: null,
    email: null,
    firstName: null,
    lastName: null,
    role: "customer",
    requestId: null,
    ipAddress: "197.218.0.1",
    userAgent: "Mozilla/5.0",
    ...overrides,
  };
}

function makeModule(calls: unknown[]) {
  return {
    listContactRequestsForAdmin: {
      execute: async (input: unknown) => {
        calls.push(input);
        return { items: [], total: 0, openCount: 0 };
      },
    } as unknown as ListContactRequestsForAdminQuery,
  };
}

describe("createContactReadHandlers", () => {
  it("refuses a caller who is not an administrator, before the use case runs", async () => {
    const calls: unknown[] = [];
    const field = createContactReadHandlers(makeModule(calls)).find((h) => h.key === "contactRequest.allForAdmin")!;
    await expect(field.handler({}, ctx({ requesterUserId: "u-1", role: "customer" }))).rejects.toThrow("administrators");
    expect(calls).toEqual([]);
  });

  it("refuses an admin role with no requester id, before the use case runs", async () => {
    const calls: unknown[] = [];
    const field = createContactReadHandlers(makeModule(calls)).find((h) => h.key === "contactRequest.allForAdmin")!;
    await expect(field.handler({}, ctx({ requesterUserId: null, role: "admin" }))).rejects.toThrow("administrators");
    expect(calls).toEqual([]);
  });

  it("lets an administrator through, passing the input on unchanged", async () => {
    const calls: unknown[] = [];
    const field = createContactReadHandlers(makeModule(calls)).find((h) => h.key === "contactRequest.allForAdmin")!;
    const args = { limit: 10, offset: 20, kind: "feedback" as const, status: "open" as const, search: "escola" };
    await field.handler(args, ctx({ requesterUserId: "admin-1", role: "admin" }));
    expect(calls).toEqual([args]);
  });
});
