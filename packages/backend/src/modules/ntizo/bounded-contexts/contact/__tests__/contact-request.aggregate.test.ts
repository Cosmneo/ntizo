import { describe, expect, it } from "bun:test";
import {
  MESSAGE_MAX,
  NAME_MAX,
  ContactRequest,
} from "../domain/aggregates/contact-request.aggregate";
import {
  ContactEmailInvalidError,
  ContactEmailRequiredError,
  ContactMessageInvalidError,
  ContactNameInvalidError,
  ContactTopicInvalidError,
} from "../domain/exceptions";

/** A complete, valid contact message; each test takes one thing away. */
function input(over: Partial<Parameters<typeof ContactRequest.create>[0]> = {}) {
  return {
    kind: "contact" as const,
    topic: "general",
    name: "  Joana Matola ",
    email: " Joana@Exemplo.com ",
    message: "Gostava de propor uma parceria com a minha escola.",
    locale: "pt-MZ",
    originPath: null,
    requesterUserId: "u-1",
    ipAddress: "197.218.0.1",
    userAgent: "Mozilla/5.0",
    ...over,
  };
}

describe("ContactRequest.create — normalisation", () => {
  it("trims the name and the message, and lower-cases the email", () => {
    const r = ContactRequest.create(input());
    expect(r.name).toBe("Joana Matola");
    expect(r.email).toBe("joana@exemplo.com");
    expect(r.message).toBe("Gostava de propor uma parceria com a minha escola.");
    expect(r.status).toBe("open");
    expect(r.id).toBeNull();
  });

  it("stores an empty feedback email as none, not as an empty string", () => {
    const r = ContactRequest.create(input({ kind: "feedback", topic: "idea", email: "   " }));
    expect(r.email).toBeNull();
  });

  it("cuts an over-long origin path rather than refusing the message for it", () => {
    const r = ContactRequest.create(input({ originPath: `/services/${"x".repeat(300)}` }));
    expect(r.originPath!.length).toBe(200);
  });
});

describe("ContactRequest.create — refusals", () => {
  it("refuses a name that is too short or too long", () => {
    expect(() => ContactRequest.create(input({ name: "J" }))).toThrow(ContactNameInvalidError);
    expect(() => ContactRequest.create(input({ name: "x".repeat(NAME_MAX + 1) }))).toThrow(ContactNameInvalidError);
  });

  it("refuses a message that is too short or too long", () => {
    expect(() => ContactRequest.create(input({ message: "olá" }))).toThrow(ContactMessageInvalidError);
    expect(() => ContactRequest.create(input({ message: "x".repeat(MESSAGE_MAX + 1) }))).toThrow(ContactMessageInvalidError);
  });

  it("requires an email on contact, but not on feedback", () => {
    expect(() => ContactRequest.create(input({ kind: "contact", topic: "general", email: null }))).toThrow(ContactEmailRequiredError);
    expect(() => ContactRequest.create(input({ email: "" }))).toThrow(ContactEmailRequiredError);
    expect(ContactRequest.create(input({ kind: "feedback", topic: "praise", email: null })).email).toBeNull();
  });

  it("refuses an email that is not shaped like one, on feedback too", () => {
    expect(() => ContactRequest.create(input({ email: "joana" }))).toThrow(ContactEmailInvalidError);
    expect(() => ContactRequest.create(input({ kind: "feedback", topic: "idea", email: "not an email" }))).toThrow(ContactEmailInvalidError);
  });

  it("refuses a topic that belongs to another kind", () => {
    expect(() => ContactRequest.create(input({ topic: "idea" }))).toThrow(ContactTopicInvalidError);
  });
});

describe("ContactRequest — resolving", () => {
  const saved = ContactRequest.create(input()).withId("7f3a2c9e-1b2d-4e5f-8a9b-0c1d2e3f4a5b");

  it("resolve records who and when, and reopen clears both", () => {
    const at = new Date("2026-09-02T10:00:00.000Z");
    const resolved = saved.resolve(at, "admin-1");
    expect(resolved.status).toBe("resolved");
    expect(resolved.resolvedAt).toEqual(at);
    expect(resolved.resolvedByUserId).toBe("admin-1");

    const reopened = resolved.reopen();
    expect(reopened.status).toBe("open");
    expect(reopened.resolvedAt).toBeNull();
    expect(reopened.resolvedByUserId).toBeNull();
  });

  it("is idempotent in both directions — two administrators pressing the same button is not an error", () => {
    const at = new Date("2026-09-02T10:00:00.000Z");
    const once = saved.resolve(at, "admin-1");
    const twice = once.resolve(new Date("2026-09-02T11:00:00.000Z"), "admin-2");
    expect(twice.resolvedAt).toEqual(at);
    expect(twice.resolvedByUserId).toBe("admin-1");
    expect(saved.reopen()).toBe(saved);
  });

  it("derives the reference from the id", () => {
    expect(saved.reference).toBe("7F3A2C");
    expect(() => ContactRequest.create(input()).reference).toThrow();
  });
});
