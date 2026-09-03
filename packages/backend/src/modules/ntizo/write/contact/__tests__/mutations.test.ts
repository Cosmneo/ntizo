import { describe, expect, it } from "bun:test";
import type { NtizoGraphqlContext } from "../../../graphql/context";
import type { ContactBootstrap } from "../../../bounded-contexts/contact/bootstrap";
import { createContactWriteHandlers } from "../graphql/handlers/mutations.handlers";
import { contactWriteSchema } from "../graphql/schema/mutations";

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

function makeModule(calls: { submit: unknown[]; setStatus: unknown[] }) {
  return {
    contact: {
      adapters: {} as never,
      useCases: {
        submitContactRequest: {
          execute: async (input: unknown) => {
            calls.submit.push(input);
            return { requestId: "7f3a2c9e-1b2d-4e5f-8a9b-0c1d2e3f4a5b", reference: "7F3A2C" };
          },
        },
        listContactRequestsForAdmin: { execute: async () => ({ items: [], total: 0, openCount: 0 }) },
        setContactRequestStatus: {
          execute: async (input: unknown) => {
            calls.setStatus.push(input);
            return { status: "resolved" as const };
          },
        },
      },
    } as unknown as ContactBootstrap,
  };
}

const FORM = {
  kind: "contact" as const,
  topic: "general",
  name: "Joana Matola",
  email: "joana@exemplo.com",
  message: "Gostava de propor uma parceria com a minha escola.",
  locale: "pt-MZ",
  originPath: null,
};

describe("the contact write schema", () => {
  it("exposes submit and setStatus", () => {
    const fields = Object.keys(
      (contactWriteSchema as unknown as { fields: { contactRequest: object } }).fields.contactRequest,
    ).sort();
    expect(fields).toEqual(["setStatus", "submit"]);
  });
});

describe("createContactWriteHandlers", () => {
  it("lets an anonymous caller submit, stamping the address and no user from the context", async () => {
    const calls = { submit: [] as unknown[], setStatus: [] as unknown[] };
    const field = createContactWriteHandlers(makeModule(calls)).find((h) => h.key === "contactRequest.submit")!;
    const out = await field.handler({ ...FORM, requesterUserId: "victim" }, ctx());
    expect(out).toEqual({ requestId: "7f3a2c9e-1b2d-4e5f-8a9b-0c1d2e3f4a5b", reference: "7F3A2C" });
    expect(calls.submit).toEqual([{ ...FORM, requesterUserId: null, ipAddress: "197.218.0.1", userAgent: "Mozilla/5.0" }]);
  });

  it("stamps the session's user id when there is one", async () => {
    const calls = { submit: [] as unknown[], setStatus: [] as unknown[] };
    const field = createContactWriteHandlers(makeModule(calls)).find((h) => h.key === "contactRequest.submit")!;
    await field.handler(FORM, ctx({ requesterUserId: "u-session" }));
    expect((calls.submit[0] as { requesterUserId: string }).requesterUserId).toBe("u-session");
  });

  it("answers a filled honeypot with a success it never wrote", async () => {
    const calls = { submit: [] as unknown[], setStatus: [] as unknown[] };
    const field = createContactWriteHandlers(makeModule(calls)).find((h) => h.key === "contactRequest.submit")!;
    const out = (await field.handler({ ...FORM, website: "http://spam.example" }, ctx())) as { requestId: string; reference: string };
    expect(out.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(out.reference).toHaveLength(6);
    expect(calls.submit).toEqual([]);
  });

  it("refuses setStatus from anyone who is not an administrator, before the use case runs", async () => {
    const calls = { submit: [] as unknown[], setStatus: [] as unknown[] };
    const field = createContactWriteHandlers(makeModule(calls)).find((h) => h.key === "contactRequest.setStatus")!;
    const args = { requestId: "7f3a2c9e-1b2d-4e5f-8a9b-0c1d2e3f4a5b", status: "resolved" };
    await expect(field.handler(args, ctx({ requesterUserId: "u-1", role: "customer" }))).rejects.toThrow("administrators");
    await expect(field.handler(args, ctx({ requesterUserId: null, role: "admin" }))).rejects.toThrow("administrators");
    expect(calls.setStatus).toEqual([]);
  });

  it("stamps the administrator as the actor on setStatus", async () => {
    const calls = { submit: [] as unknown[], setStatus: [] as unknown[] };
    const field = createContactWriteHandlers(makeModule(calls)).find((h) => h.key === "contactRequest.setStatus")!;
    await field.handler(
      { requestId: "7f3a2c9e-1b2d-4e5f-8a9b-0c1d2e3f4a5b", status: "resolved", actorUserId: "victim" },
      ctx({ requesterUserId: "admin-1", role: "admin" }),
    );
    expect(calls.setStatus).toEqual([
      { requestId: "7f3a2c9e-1b2d-4e5f-8a9b-0c1d2e3f4a5b", status: "resolved", actorUserId: "admin-1" },
    ]);
  });
});
