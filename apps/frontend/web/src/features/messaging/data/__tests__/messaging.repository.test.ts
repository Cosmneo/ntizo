import { afterEach, describe, expect, it, vi } from "vitest";
import type { MessagePageDTO, ThreadPageDTO } from "@ntizo/shared/read-models";
import {
  MESSAGES_PAGE_SIZE,
  THREADS_PAGE_SIZE,
  messagingQueries,
} from "../messaging.repository";
import * as client from "@/shared/lib/graphql/session-graphql";

afterEach(() => vi.restoreAllMocks());

const twoThreadPage: ThreadPageDTO = {
  items: [
    {
      id: "t1",
      providerId: "p1",
      providerName: "Studio X",
      customerName: "Ana Silva",
      lastMessageAt: "2026-01-01T00:00:00.000Z",
      lastMessagePreview: "Olá, tudo bem?",
      unreadCount: 2,
    },
    {
      id: "t2",
      providerId: "p2",
      providerName: "Studio Y",
      customerName: "Carlos Mendes",
      lastMessageAt: "2026-01-02T00:00:00.000Z",
      lastMessagePreview: "Confirmado para amanhã",
      unreadCount: 0,
    },
  ],
  nextCursor: "cursor-2",
};

const twoMessagePage: MessagePageDTO = {
  items: [
    {
      id: "m1",
      threadId: "t1",
      senderUserId: "u-customer",
      body: "Olá, tudo bem?",
      readAt: null,
      createdAt: "2026-01-02T10:00:00.000Z",
    },
    {
      id: "m2",
      threadId: "t1",
      senderUserId: "u-provider",
      body: "Tudo bem, em que posso ajudar?",
      readAt: "2026-01-02T10:05:00.000Z",
      createdAt: "2026-01-02T09:00:00.000Z",
    },
  ],
  nextCursor: null,
};

/** Narrows an `infiniteQueryOptions()` result's `queryFn` to the one shape every test here calls it with. */
function queryFnOf<TPage>(opts: {
  queryFn?: unknown;
}): (ctx: { pageParam: string | undefined }) => Promise<TPage> {
  return opts.queryFn as (ctx: {
    pageParam: string | undefined;
  }) => Promise<TPage>;
}

describe("messagingQueries.mine", () => {
  it("calls the flattened field `communicationMyThreads`, never nested `communication { myThreads }`", async () => {
    // The one bug this project already lost a round to (twice, in activity
    // and notifications): the schema builder flattens
    // `{ communication: { myThreads } }` to `communicationMyThreads` on the
    // wire. A query written as if it were nested would fail against the
    // real server even though nothing here would catch it without asserting
    // the query text itself.
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ communicationMyThreads: twoThreadPage } as never);

    const opts = messagingQueries.mine();
    const result = await queryFnOf<ThreadPageDTO>(opts)({
      pageParam: undefined,
    });

    const [query] = spy.mock.calls[0]!;
    expect(query as string).toContain("communicationMyThreads");
    expect(query as string).not.toContain("communication {");
    expect(query as string).not.toMatch(/communication\s*\{\s*myThreads/);

    // Two rows with distinct `lastMessageAt`, asserted in order: a
    // single-item fixture would pass even if the unwrap silently dropped or
    // reordered entries.
    expect(result).toEqual(twoThreadPage);
    expect(result.items.map((i) => i.id)).toEqual(["t1", "t2"]);
  });

  it("selects every field the customer inbox row and unread badge need, not just id and cursor", async () => {
    // `sessionGraphql` is mocked in every test in this file, so a fixture
    // (`twoThreadPage`) hands back whatever fields it likes regardless of
    // what the query text actually asks for — the field-name assertion above
    // catches a nested-vs-flat rewrite but nothing here previously caught a
    // field silently dropped from the selection set. Deleting `providerName`
    // leaves every row of the customer's inbox reading "Prestador" (the
    // fallback), and deleting `unreadCount` leaves no unread badge ever
    // rendering — both with 102/102 tests green, because the fixture still
    // returns them. Asserting the literal selection set is what reds on that.
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ communicationMyThreads: twoThreadPage } as never);

    const opts = messagingQueries.mine();
    await queryFnOf<ThreadPageDTO>(opts)({ pageParam: undefined });

    const [query] = spy.mock.calls[0]!;
    expect(query as string).toContain(
      "items { id providerId providerName customerName lastMessageAt lastMessagePreview unreadCount }",
    );
  });

  it("sends the page size and no cursor on the first page", async () => {
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ communicationMyThreads: { items: [], nextCursor: null } } as never);

    const opts = messagingQueries.mine();
    await queryFnOf<ThreadPageDTO>(opts)({ pageParam: undefined });

    const [, variables] = spy.mock.calls[0]!;
    expect(variables).toEqual({
      input: { limit: THREADS_PAGE_SIZE, cursor: undefined },
    });
  });

  it("passes a later cursor through untouched, not reset to the first page", async () => {
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ communicationMyThreads: { items: [], nextCursor: null } } as never);

    const opts = messagingQueries.mine();
    await queryFnOf<ThreadPageDTO>(opts)({ pageParam: "cursor-2" });

    const [, variables] = spy.mock.calls[0]!;
    expect(variables).toEqual({
      input: { limit: THREADS_PAGE_SIZE, cursor: "cursor-2" },
    });
  });

  it("maps a real cursor to the next page param, and a null one to undefined", () => {
    const opts = messagingQueries.mine();
    const getNextPageParam = opts.getNextPageParam as (
      last: ThreadPageDTO,
    ) => string | undefined;
    expect(getNextPageParam(twoThreadPage)).toBe("cursor-2");
    expect(getNextPageParam({ items: [], nextCursor: null })).toBeUndefined();
  });
});

describe("messagingQueries.forProvider", () => {
  it("calls the flattened field `communicationProviderThreads`, never nested, and sends `providerId`", async () => {
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ communicationProviderThreads: twoThreadPage } as never);

    const opts = messagingQueries.forProvider("p1");
    const result = await queryFnOf<ThreadPageDTO>(opts)({
      pageParam: undefined,
    });

    const [query, variables] = spy.mock.calls[0]!;
    expect(query as string).toContain("communicationProviderThreads");
    expect(query as string).not.toContain("communication {");
    expect(variables).toEqual({
      input: { providerId: "p1", limit: THREADS_PAGE_SIZE, cursor: undefined },
    });
    expect(result.items.map((i) => i.id)).toEqual(["t1", "t2"]);
  });

  it("selects every field the provider inbox row and unread badge need, not just id and cursor", async () => {
    // Same reasoning as `messagingQueries.mine`'s identical test: deleting
    // `customerName` from this selection set leaves every row of a
    // provider's own inbox reading "Cliente" — the exact bug Task 11's fix
    // round existed to fix — with every other test still green because the
    // mocked fixture returns it regardless of what was actually asked for.
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ communicationProviderThreads: twoThreadPage } as never);

    const opts = messagingQueries.forProvider("p1");
    await queryFnOf<ThreadPageDTO>(opts)({ pageParam: undefined });

    const [query] = spy.mock.calls[0]!;
    expect(query as string).toContain(
      "items { id providerId providerName customerName lastMessageAt lastMessagePreview unreadCount }",
    );
  });

  it("is disabled for an empty provider id, the same guard notificationQueries.forProvider needs", () => {
    expect(messagingQueries.forProvider("").enabled).toBe(false);
    expect(messagingQueries.forProvider("p1").enabled).toBe(true);
  });
});

describe("messagingQueries.thread", () => {
  it("calls the flattened field `communicationThreadMessages`, never nested, and sends `threadId`", async () => {
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ communicationThreadMessages: twoMessagePage } as never);

    const opts = messagingQueries.thread("t1");
    const result = await queryFnOf<MessagePageDTO>(opts)({
      pageParam: undefined,
    });

    const [query, variables] = spy.mock.calls[0]!;
    expect(query as string).toContain("communicationThreadMessages");
    expect(query as string).not.toContain("communication {");
    expect(variables).toEqual({
      input: { threadId: "t1", limit: MESSAGES_PAGE_SIZE, cursor: undefined },
    });

    // Two messages with distinct `createdAt`, asserted in the exact order
    // the wire sent them (newest first) — a one-row fixture cannot tell a
    // correct list from a truncated or reversed one.
    expect(result.items.map((i) => i.id)).toEqual(["m1", "m2"]);
  });

  it("selects every field a message bubble needs, not just id and cursor", async () => {
    // Same reasoning as `messagingQueries.mine`'s identical test: deleting
    // `body` from this selection set means every message bubble renders
    // empty, with every other test in this file still green because the
    // mocked fixture (`twoMessagePage`) hands `body` back regardless of what
    // the query text actually asked for.
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ communicationThreadMessages: twoMessagePage } as never);

    const opts = messagingQueries.thread("t1");
    await queryFnOf<MessagePageDTO>(opts)({ pageParam: undefined });

    const [query] = spy.mock.calls[0]!;
    expect(query as string).toContain(
      "items { id threadId senderUserId body readAt createdAt }",
    );
  });

  it("passes a later cursor through untouched", async () => {
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ communicationThreadMessages: { items: [], nextCursor: null } } as never);

    const opts = messagingQueries.thread("t1");
    await queryFnOf<MessagePageDTO>(opts)({ pageParam: "cursor-9" });

    const [, variables] = spy.mock.calls[0]!;
    expect(variables).toEqual({
      input: { threadId: "t1", limit: MESSAGES_PAGE_SIZE, cursor: "cursor-9" },
    });
  });

  it("is the only query in this feature that polls", () => {
    expect(messagingQueries.thread("t1").refetchInterval).toBe(5_000);
    expect(messagingQueries.mine().refetchInterval).toBeUndefined();
    expect(messagingQueries.forProvider("p1").refetchInterval).toBeUndefined();
  });

  it("is disabled for an empty thread id", () => {
    expect(messagingQueries.thread("").enabled).toBe(false);
    expect(messagingQueries.thread("t1").enabled).toBe(true);
  });
});

describe("page sizes", () => {
  it("both stay inside the server's 1..50 window — over 50 is VALIDATION_ERROR, not a clamp", () => {
    expect(THREADS_PAGE_SIZE).toBeGreaterThanOrEqual(1);
    expect(THREADS_PAGE_SIZE).toBeLessThanOrEqual(50);
    expect(MESSAGES_PAGE_SIZE).toBeGreaterThanOrEqual(1);
    expect(MESSAGES_PAGE_SIZE).toBeLessThanOrEqual(50);
  });
});
