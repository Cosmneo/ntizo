import { describe, expect, it } from "bun:test";
import { getGraphQLErrorCode } from "@cosmneo/onion-lasagna";
import {
  MAX_ATTACHMENTS,
  Message,
  MESSAGE_BODY_MAX,
  NOTIFY_AFTER_MS,
} from "../domain/aggregates/message.aggregate";
import { Thread } from "../domain/aggregates/thread.aggregate";
import {
  MessageEmptyError,
  MessageBodyTooLongError,
  ProviderNotContactableError,
  ThreadNotVisibleError,
  ThreadTypeInvalidError,
  TooManyAttachmentsError,
} from "../domain/exceptions";

const now = new Date("2026-08-27T10:00:00.000Z");
const NOW = new Date("2026-09-02T10:00:00.000Z");
const base = {
  threadId: "11111111-1111-1111-1111-111111111111",
  senderUserId: "u1",
  senderSide: "customer" as const,
  now,
};

describe("Message.compose", () => {
  it("refuses a body that is only whitespace", () => {
    expect(() => Message.compose({ ...base, body: "   \n\t " })).toThrow(MessageEmptyError);
  });

  it("allows an empty body when an attachment rides with it", () => {
    const m = Message.compose({ ...base, body: "", attachmentCount: 1 });
    expect(m.body).toBe("");
  });

  it("still refuses a message carrying nothing at all", () => {
    expect(() => Message.compose({ ...base, body: "   ", attachmentCount: 0 })).toThrow(MessageEmptyError);
  });

  it("refuses more than five attachments", () => {
    expect(() => Message.compose({ ...base, body: "olá", attachmentCount: 6 })).toThrow(
      TooManyAttachmentsError,
    );
  });

  it("accepts exactly the attachment limit", () => {
    const m = Message.compose({ ...base, body: "", attachmentCount: MAX_ATTACHMENTS });
    expect(m.body).toBe("");
  });

  it("refuses a body over the limit", () => {
    expect(() => Message.compose({ ...base, body: "x".repeat(MESSAGE_BODY_MAX + 1) })).toThrow(
      MessageBodyTooLongError,
    );
  });

  it("accepts a body exactly at the limit", () => {
    const m = Message.compose({ ...base, body: "x".repeat(MESSAGE_BODY_MAX) });
    expect(m.body.length).toBe(MESSAGE_BODY_MAX);
  });

  it("trims the stored body but measures the trimmed length", () => {
    const m = Message.compose({ ...base, body: "  olá  " });
    expect(m.body).toBe("olá");
  });

  it("sets notifyDueAt two minutes after now, and nothing else", () => {
    const m = Message.compose({ ...base, body: "olá" });
    expect(m.notifyDueAt?.getTime()).toBe(now.getTime() + 120_000);
    // Pinned against the named constant too, not just the literal above —
    // this is the constant a later task's sweep is meant to import instead
    // of repeating the number.
    expect(m.notifyDueAt?.getTime()).toBe(now.getTime() + NOTIFY_AFTER_MS);
    expect(m.readAt).toBeNull();
    expect(m.notifiedAt).toBeNull();
  });
});

describe("Message.rehydrate", () => {
  it("trusts the database and does not re-validate", () => {
    // A row written before a rule existed must still be readable. This is the
    // read path; `compose` is the write path.
    const m = Message.rehydrate({
      id: "22222222-2222-2222-2222-222222222222",
      threadId: base.threadId,
      senderUserId: "u1",
      senderSide: "customer",
      body: "",
      readAt: null,
      notifyDueAt: null,
      notifiedAt: null,
      createdAt: now,
    });
    expect(m.body).toBe("");
  });
});

// The brief's Interfaces block promises `Thread.open` and `Thread.rehydrate`,
// but its Step 1 test block covers `Message` only. These are the mirror
// tests: the same two-factory split existed in the activity phase guarded
// only by a comment, and swapping `rehydrate`'s body for `open`'s left all
// sixteen tests there green. See "Step 6" below for the mutation proof.
describe("Thread.open", () => {
  const threadBase = { customerUserId: "c1", providerId: "p1", lastMessageAt: now };

  it("accepts a type listed in THREAD_TYPES", () => {
    const t = Thread.open({ ...threadBase, type: "inquiry" });
    expect(t.type).toBe("inquiry");
  });

  it("rejects a type that is not in THREAD_TYPES", () => {
    // "support" used to be the example of an invalid type here, back when
    // THREAD_TYPES listed only "inquiry" — phase 2 added "support" to that
    // list, so a genuinely unlisted string is what this test needs now.
    expect(() => Thread.open({ ...threadBase, type: "retired-type" as never })).toThrow(ThreadTypeInvalidError);
  });

  it("always opens with a null id — Thread has no revise, so there is never a known id to build around; the repository assigns one on insert", () => {
    const t = Thread.open({ ...threadBase, type: "inquiry" });
    expect(t.id).toBeNull();
  });
});

describe("Thread.rehydrate", () => {
  it("accepts a row without checking it", () => {
    // A row whose `type` predates today's THREAD_TYPES (or one this version
    // no longer lists) must still be readable. This is the read path;
    // `open` is the write path.
    const t = Thread.rehydrate({
      id: "33333333-3333-3333-3333-333333333333",
      type: "retired-type" as never,
      customerUserId: "c1",
      providerId: "p1",
      lastMessageAt: now,
      createdAt: now,
    });
    expect(t.type as string).toBe("retired-type");
  });
});

/**
 * `toThrow(SomeError)` is `instanceof`-based: it stays green even if the
 * error class stops extending `UnprocessableError`, because subclassing a
 * bare `Error` with a bolted-on `code` still satisfies `instanceof`. What a
 * GraphQL client actually sees is the string `getGraphQLErrorCode` produces,
 * so that is what gets pinned here — the same reason
 * `read/activity/__tests__/cursor-invalid.graphql-code.test.ts` exists for
 * `CursorInvalidError`.
 */
describe("communication domain exceptions, at the boundary that makes them client-facing", () => {
  it("are not masked to INTERNAL_ERROR by the kit — every one maps to UNPROCESSABLE", () => {
    const errors: Error[] = [
      new MessageEmptyError(),
      new MessageBodyTooLongError(4001, MESSAGE_BODY_MAX),
      new TooManyAttachmentsError(6, MAX_ATTACHMENTS),
      new ThreadNotVisibleError(),
      new ProviderNotContactableError(),
      new ThreadTypeInvalidError("support"),
    ];
    const masked = errors.filter((e) => getGraphQLErrorCode(e) === "INTERNAL_ERROR");
    expect(masked.map((e) => e.name)).toEqual([]);
  });

  it("carries a stable, distinct code per failure mode", () => {
    // Every code below is a PUBLIC CONTRACT a client can branch on; renaming
    // one is a breaking change to callers, not a refactor.
    const codes = {
      MessageEmptyError: new MessageEmptyError().code,
      MessageBodyTooLongError: new MessageBodyTooLongError(4001, MESSAGE_BODY_MAX).code,
      TooManyAttachmentsError: new TooManyAttachmentsError(6, MAX_ATTACHMENTS).code,
      ThreadNotVisibleError: new ThreadNotVisibleError().code,
      ProviderNotContactableError: new ProviderNotContactableError().code,
      ThreadTypeInvalidError: new ThreadTypeInvalidError("support").code,
    };
    expect(codes).toEqual({
      MessageEmptyError: "MESSAGE_EMPTY",
      MessageBodyTooLongError: "MESSAGE_BODY_TOO_LONG",
      TooManyAttachmentsError: "TOO_MANY_ATTACHMENTS",
      ThreadNotVisibleError: "THREAD_NOT_VISIBLE",
      ProviderNotContactableError: "PROVIDER_NOT_CONTACTABLE",
      ThreadTypeInvalidError: "THREAD_TYPE_INVALID",
    });
  });
});

describe("Thread.openSupport", () => {
  it("opens a personal request with no provider", () => {
    const t = Thread.openSupport({ customerUserId: "u1", providerId: null, now: NOW });
    expect(t.type).toBe("support");
    expect(t.providerId).toBeNull();
    expect(t.customerUserId).toBe("u1");
    expect(t.lastMessageAt).toEqual(NOW);
    expect(t.createdAt).toEqual(NOW);
  });

  it("opens a provider request carrying the provider", () => {
    const t = Thread.openSupport({ customerUserId: "member-1", providerId: "p1", now: NOW });
    expect(t.type).toBe("support");
    expect(t.providerId).toBe("p1");
  });
});

describe("Message.compose carries a side", () => {
  it("stores the side it was given", () => {
    const m = Message.compose({ threadId: "t", senderUserId: "u", senderSide: "platform", body: "hi", now: NOW });
    expect(m.senderSide).toBe("platform");
  });
});
