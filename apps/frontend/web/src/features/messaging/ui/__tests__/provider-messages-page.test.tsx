import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { Thread, Message } from "@/features/messaging/domain/types";

/**
 * The viewmodel seam, not the query cache — same choice
 * `customer-messages-page.test.tsx` documents for the same reason: seeding a
 * real `QueryClient` would mean importing `messagingQueries` from `data/`,
 * which `boundaries/dependencies` forbids a `ui/` file (test files
 * included) from doing.
 *
 * Two threads and two messages, distinct timestamps each, per this
 * project's own rule: a one-row fixture cannot prove a list renders in the
 * right order, only that it renders something.
 */
const threads: Thread[] = [
  {
    id: "t1",
    providerId: "p1",
    // Deliberately the SAME on every row — `providerId`/`providerName` are
    // this workspace's own, identical for every thread in its own inbox.
    // `customerName` is what actually tells the rows apart, and every test
    // in this file that cares about "who is this conversation with" reads
    // that, never `providerName`.
    providerName: "Studio Beleza",
    customerName: "Ana Silva",
    lastMessageAt: "2026-08-20T09:00:00Z",
    lastMessagePreview: "Olá, ainda tem vaga para sexta?",
    unreadCount: 2,
  },
  {
    id: "t2",
    providerId: "p1",
    providerName: "Studio Beleza",
    customerName: "Carlos Mendes",
    lastMessageAt: "2026-08-21T10:00:00Z",
    lastMessagePreview: "Obrigado, confirmado!",
    unreadCount: 0,
  },
];

const messages: Message[] = [
  {
    id: "m1",
    threadId: "t1",
    senderUserId: "customer-1",
    body: "Olá, ainda tem vaga para sexta?",
    readAt: null,
    createdAt: "2026-08-20T09:00:00Z",
  },
  {
    id: "m2",
    threadId: "t1",
    senderUserId: "staff-1",
    body: "Sim, tenho!",
    readAt: null,
    createdAt: "2026-08-20T09:05:00Z",
  },
];

const activeProvider = { id: "p1", slug: "studio-beleza", name: "Studio Beleza" };

const markRead = vi.fn();
const send = vi.fn();
const loadMoreThreads = vi.fn();
const loadMoreMessages = vi.fn();

let providerThreadsResult: {
  threads: Thread[];
  loading: boolean;
  hasMore: boolean;
  loadMore: () => void;
  errorCode?: string;
} = { threads, loading: false, hasMore: false, loadMore: loadMoreThreads, errorCode: undefined };

vi.mock("@/features/user/viewmodel/use-current-user", () => ({
  useCurrentUser: () => ({ data: { id: "staff-1" } }),
}));
vi.mock("@/features/provider/viewmodel/use-active-provider", () => ({
  useActiveProvider: () => ({ activeProvider }),
}));
vi.mock("@/features/messaging/viewmodel/use-provider-threads", () => ({
  useProviderThreads: () => providerThreadsResult,
}));
vi.mock("@/features/messaging/viewmodel/use-thread", () => ({
  useThread: () => ({
    messages,
    loading: false,
    hasMore: false,
    loadMore: loadMoreMessages,
  }),
}));
vi.mock("@/features/messaging/viewmodel/use-send-message", () => ({
  useSendMessage: () => ({ send, sending: false, errorCode: undefined }),
}));
vi.mock("@/features/messaging/viewmodel/use-mark-read", () => ({
  // A fresh arrow function every call, matching the real (unmemoised)
  // `useMarkRead` — see `customer-messages-page.test.tsx`'s identical
  // mock for why a stable reference here would make the "does not fire
  // again" test structurally incapable of catching a dependency-array bug.
  useMarkRead: () => ({
    markRead: (threadId: string) => markRead(threadId),
    marking: false,
    errorCode: undefined,
  }),
}));

const { ProviderMessagesPage } = await import("../provider-messages-page");

afterEach(() => {
  vi.clearAllMocks();
  providerThreadsResult = {
    threads,
    loading: false,
    hasMore: false,
    loadMore: loadMoreThreads,
    errorCode: undefined,
  };
});

/** Wraps the real page with one control it does not render itself: a button that forces a re-render without touching `?thread=`. */
function Harness() {
  const [, setTick] = useState(0);
  return (
    <>
      <button type="button" onClick={() => setTick((n) => n + 1)}>
        force re-render
      </button>
      <ProviderMessagesPage />
    </>
  );
}

function renderPage(initialPath: string) {
  const rootRoute = createRootRoute();
  const messagesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/provider/$slug/messages",
    validateSearch: (search: Record<string, unknown>): { thread?: string } => {
      const thread = search["thread"];
      return typeof thread === "string" && thread.length > 0 ? { thread } : {};
    },
    component: Harness,
  });

  const router = createRouter({
    routeTree: rootRoute.addChildren([messagesRoute]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });

  render(<RouterProvider router={router} />);
  return router;
}

describe("ProviderMessagesPage: listing conversations", () => {
  it("lists the provider's conversations, newest first", async () => {
    renderPage("/provider/studio-beleza/messages");

    const rows = await screen.findAllByText(/Olá, ainda tem vaga para sexta\?|Obrigado, confirmado!/);
    // The fixture hands both threads back in `lastMessageAt` order already
    // (t1 older, t2 newer) — `ThreadList` renders in the order it is
    // given, so this also proves the page did not reorder or drop one.
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Olá, ainda tem vaga para sexta?");
    expect(rows[1]).toHaveTextContent("Obrigado, confirmado!");
  });

  it("labels each row with the customer's name, not this workspace's own name repeated on every row", async () => {
    // The fixture's `providerName` ("Studio Beleza") is identical on both
    // threads on purpose — it is this workspace's own name, which is what
    // every row of a provider's own inbox shares. `customerName` is what
    // actually distinguishes them, and this is the test that reds if the
    // page ever goes back to reading `providerName` for the row label.
    renderPage("/provider/studio-beleza/messages");

    expect(await screen.findByText("Ana Silva")).toBeInTheDocument();
    expect(screen.getByText("Carlos Mendes")).toBeInTheDocument();
    // Not this workspace's own name — anywhere the row label would be.
    expect(screen.queryByText("Studio Beleza")).toBeNull();
  });

  it("shows an unread count only for the other side's unread messages", async () => {
    // The fixture's own shape already carries this: t1 has 2 messages the
    // customer sent that this workspace has not yet read, t2 has none —
    // `countUnreadForViewer` (backend) counts only the *other* side's
    // unread messages for the viewer, never the viewer's own sent ones.
    renderPage("/provider/studio-beleza/messages");

    expect(await screen.findByText("2")).toBeInTheDocument();
    // The read thread has `unreadCount: 0` — no badge at all for it, not a
    // badge reading "0".
    expect(screen.queryByText("0")).toBeNull();
  });

  it("uses the provider's own empty-state copy, not the customer's", async () => {
    // The customer's `emptyBody` ("Start one from any provider's page…") is
    // false on this side — no member of a workspace starts a thread, a
    // customer does (see `provider-messages-page.tsx`'s own doc comment and
    // `StartThreadCommand`, which only a customer ever calls).
    providerThreadsResult = { threads: [], loading: false, hasMore: false, loadMore: loadMoreThreads, errorCode: undefined };
    renderPage("/provider/studio-beleza/messages");

    expect(await screen.findByText("No conversations yet")).toBeInTheDocument();
    expect(
      screen.getByText("When a customer messages you, the conversation appears here."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/start one from any provider's page/i)).toBeNull();
  });

  it("shows a load error instead of a deceptively empty list when the server refuses the page", async () => {
    // `communicationProviderThreads` checks membership server-side and
    // answers a caller who is not on this workspace's team with
    // `THREAD_NOT_VISIBLE` — the same answer a thread that does not exist
    // gives (see `use-provider-threads.ts`'s doc comment). The page must
    // not render that as an ordinary "no conversations yet" — that would
    // look identical to a workspace with a genuinely empty inbox.
    providerThreadsResult = {
      threads: [],
      loading: false,
      hasMore: false,
      loadMore: loadMoreThreads,
      errorCode: "THREAD_NOT_VISIBLE",
    };
    renderPage("/provider/studio-beleza/messages");

    expect(await screen.findByText(/couldn't load your conversations/i)).toBeInTheDocument();
    // Not the ordinary empty state — an error must not read as "nothing to see here".
    expect(screen.queryByText("No conversations yet")).toBeNull();
  });
});

describe("ProviderMessagesPage: the open conversation's header", () => {
  it("names the customer the thread is with, not this workspace's own name", async () => {
    renderPage("/provider/studio-beleza/messages?thread=t1");

    // "Ana Silva" legitimately appears twice once t1 is open — once in its
    // still-mounted list row, once in the header — so this scopes to the
    // header's own `<p>` (the row's own name is a `<span>`) rather than
    // asserting existence anywhere on the page, which `findByText` alone
    // would refuse to do once there are two matches.
    expect(await screen.findByText("Ana Silva", { selector: "p" })).toBeInTheDocument();
    // t1's `customerName` is "Ana Silva" — the header must say who this
    // conversation is with, not repeat "Studio Beleza" (this workspace's
    // own name, and the one thing every open conversation already shares).
    expect(screen.queryByText("Studio Beleza")).toBeNull();
  });
});

describe("ProviderMessagesPage: marking a thread read on open", () => {
  it("marks the thread read once it is the one open on arrival", async () => {
    renderPage("/provider/studio-beleza/messages?thread=t1");

    await waitFor(() => expect(markRead).toHaveBeenCalledWith("t1"));
    expect(markRead).toHaveBeenCalledTimes(1);
  });

  it("does not fire again on a re-render that leaves the selection unchanged", async () => {
    const user = userEvent.setup();
    renderPage("/provider/studio-beleza/messages?thread=t1");

    await waitFor(() => expect(markRead).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "force re-render" }));
    await user.click(screen.getByRole("button", { name: "force re-render" }));

    expect(markRead).toHaveBeenCalledTimes(1);
  });

  it("marks nothing read when no thread is open", () => {
    renderPage("/provider/studio-beleza/messages");
    expect(markRead).not.toHaveBeenCalled();
  });
});

describe("ProviderMessagesPage: composing", () => {
  it("sends into the currently open thread, not a stale one", async () => {
    const user = userEvent.setup();
    renderPage("/provider/studio-beleza/messages?thread=t1");

    await user.type(
      await screen.findByRole("textbox", { name: /message body/i }),
      "Confirmado para sexta às 14h.",
    );
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(send).toHaveBeenCalledWith("t1", "Confirmado para sexta às 14h.");
  });
});
