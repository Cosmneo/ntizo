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
 * `service-detail-page.test.tsx` documents for the same reason: seeding a
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
    providerName: "Barbearia Central",
    customerName: "Ana Silva",
    lastMessageAt: "2026-08-20T09:00:00Z",
    lastMessagePreview: "Olá, ainda tem vaga?",
    unreadCount: 1,
  },
  {
    id: "t2",
    providerId: "p2",
    providerName: "Studio Beleza",
    customerName: "Ana Silva",
    lastMessageAt: "2026-08-21T10:00:00Z",
    lastMessagePreview: "Confirmado para sexta.",
    unreadCount: 0,
  },
];

const messages: Message[] = [
  {
    id: "m1",
    threadId: "t1",
    senderUserId: "provider-1",
    body: "Olá, ainda tem vaga?",
    readAt: null,
    createdAt: "2026-08-20T09:00:00Z",
    attachments: [],
  },
  {
    id: "m2",
    threadId: "t1",
    senderUserId: "u1",
    body: "Tenho sim!",
    readAt: null,
    createdAt: "2026-08-20T09:05:00Z",
    attachments: [],
  },
];

const markRead = vi.fn();
const send = vi.fn();
const loadMoreThreads = vi.fn();
const loadMoreMessages = vi.fn();

let threadsResult: {
  threads: Thread[];
  loading: boolean;
  hasMore: boolean;
  loadMore: () => void;
  errorCode?: string;
} = { threads, loading: false, hasMore: false, loadMore: loadMoreThreads, errorCode: undefined };

// A mutable `let`, not the bare `messages` constant — the "marks the newly
// arrived message read" test below needs to change what `useThread` hands
// back mid-test (a new inbound message landing, the way the 5s poll would
// deliver one) without touching `?thread=`, which a frozen fixture cannot do.
let threadResult: {
  messages: Message[];
  loading: boolean;
  hasMore: boolean;
  loadMore: () => void;
} = { messages, loading: false, hasMore: false, loadMore: loadMoreMessages };

vi.mock("@/features/user/viewmodel/use-current-user", () => ({
  useCurrentUser: () => ({ data: { id: "u1" } }),
}));
vi.mock("@/features/messaging/viewmodel/use-threads", () => ({
  useThreads: () => threadsResult,
}));
vi.mock("@/features/messaging/viewmodel/use-thread", () => ({
  useThread: () => threadResult,
}));
vi.mock("@/features/messaging/viewmodel/use-send-message", () => ({
  useSendMessage: () => ({ send, sending: false, errorCode: undefined }),
}));
vi.mock("@/features/messaging/viewmodel/use-mark-read", () => ({
  // A fresh arrow function every call — matching the real `useMarkRead`,
  // whose `markRead` is `(threadId) => mutation.mutate(threadId)` with no
  // memoisation, not a stable reference. A mock that handed back the same
  // `markRead` object forever would not reproduce the bug this file's
  // "does not fire again" test exists to catch: with an unstable reference,
  // putting it in the effect's dependency array makes an unrelated
  // re-render retrigger the effect, and only a mock with the same
  // instability can red on that mistake.
  useMarkRead: () => ({
    markRead: (threadId: string) => markRead(threadId),
    marking: false,
    errorCode: undefined,
  }),
}));

const { CustomerMessagesPage } = await import("../customer-messages-page");

afterEach(() => {
  vi.clearAllMocks();
  threadsResult = { threads, loading: false, hasMore: false, loadMore: loadMoreThreads, errorCode: undefined };
  threadResult = { messages, loading: false, hasMore: false, loadMore: loadMoreMessages };
});

/**
 * Wraps the real page with one control the page itself does not render: a
 * button that forces a re-render without touching `?thread=`. Bumping it is
 * how "re-rendering without changing the selection" is actually produced —
 * `CustomerMessagesPage` is not memoised, so a parent re-render reaches it
 * either way, and the mocked hooks above hand back fresh object literals on
 * every call the same way real query hooks do.
 */
function Harness() {
  const [, setTick] = useState(0);
  return (
    <>
      <button type="button" onClick={() => setTick((n) => n + 1)}>
        force re-render
      </button>
      <CustomerMessagesPage />
    </>
  );
}

function renderPage(initialPath: string) {
  const rootRoute = createRootRoute();
  const messagesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/messages",
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

describe("CustomerMessagesPage: marking a thread read on open", () => {
  it("marks the thread read once it is the one open on arrival", async () => {
    renderPage("/messages?thread=t1");

    await waitFor(() => expect(markRead).toHaveBeenCalledWith("t1"));
    expect(markRead).toHaveBeenCalledTimes(1);
  });

  it("does not fire again on a re-render that leaves the selection unchanged", async () => {
    const user = userEvent.setup();
    renderPage("/messages?thread=t1");

    await waitFor(() => expect(markRead).toHaveBeenCalledTimes(1));

    // Same selection, forced re-render — the exact shape of the bug this
    // effect's own dependency array was written to avoid (see
    // `customer-messages-page.tsx`'s doc comment on `markRead` being
    // deliberately left out of the array).
    await user.click(screen.getByRole("button", { name: "force re-render" }));
    await user.click(screen.getByRole("button", { name: "force re-render" }));

    expect(markRead).toHaveBeenCalledTimes(1);
  });

  it("marks the thread read again when a message from the other side arrives while it stays open", async () => {
    // The bug this test exists to catch: the effect used to depend on
    // `selectedThreadId` alone, so a reply the 5s poll delivers while the
    // customer is sitting on this exact thread never re-triggered
    // `markRead` — it stayed `read_at IS NULL` until the sweep two minutes
    // later emailed them about a message already on their screen. See
    // `customer-messages-page.tsx`'s `newestInboundMessageId` comment.
    const user = userEvent.setup();
    renderPage("/messages?thread=t1");
    await waitFor(() => expect(markRead).toHaveBeenCalledTimes(1));

    // A new inbound reply landing — same thread, one more message from the
    // provider, ahead of the existing two (newest first, per `useThread`'s
    // contract). Mutating `threadResult` and forcing a re-render is how a
    // poll tick is simulated without a real query client — see this file's
    // top-of-file comment on why the viewmodel seam is mocked instead.
    threadResult = {
      ...threadResult,
      messages: [
        {
          id: "m3",
          threadId: "t1",
          senderUserId: "provider-1",
          body: "Ainda tem vaga às 15h?",
          readAt: null,
          createdAt: "2026-08-20T09:10:00Z",
          attachments: [],
        },
        ...messages,
      ],
    };
    await user.click(screen.getByRole("button", { name: "force re-render" }));

    await waitFor(() => expect(markRead).toHaveBeenCalledTimes(2));
    expect(markRead).toHaveBeenLastCalledWith("t1");
  });

  it("marks the newly opened thread read when the selection actually changes", async () => {
    const user = userEvent.setup();
    renderPage("/messages?thread=t1");
    await waitFor(() => expect(markRead).toHaveBeenCalledWith("t1"));

    // Selecting the second thread from the list is a real navigation, not a
    // prop nudge — proves the effect still fires for the case that matters,
    // not just that it stays quiet for the case that doesn't.
    await user.click(screen.getByText("Studio Beleza"));

    await waitFor(() => expect(markRead).toHaveBeenCalledWith("t2"));
    expect(markRead).toHaveBeenCalledTimes(2);
  });

  it("marks nothing read when no thread is open", () => {
    renderPage("/messages");
    expect(markRead).not.toHaveBeenCalled();
  });
});

describe("CustomerMessagesPage: composing", () => {
  it("sends into the currently open thread, not a stale one", async () => {
    const user = userEvent.setup();
    renderPage("/messages?thread=t1");

    await user.type(
      await screen.findByRole("textbox", { name: /message body/i }),
      "Obrigado!",
    );
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(send).toHaveBeenCalledWith("t1", "Obrigado!", []);
  });
});

describe("CustomerMessagesPage: listing conversations", () => {
  it("shows a load error instead of a deceptively empty list when the server refuses the page", async () => {
    // `communicationMyThreads` can fail the same way `communicationProviderThreads`
    // can (see `use-threads.ts`'s `errorCode`) — the page must not render that
    // as an ordinary "no conversations yet", which would look identical to an
    // inbox that is genuinely empty. `provider-messages-page.test.tsx` carries
    // the same test for the provider side; this is its customer-side mirror.
    threadsResult = {
      threads: [],
      loading: false,
      hasMore: false,
      loadMore: loadMoreThreads,
      errorCode: "UNAUTHENTICATED",
    };
    renderPage("/messages");

    expect(await screen.findByText(/couldn't load your conversations/i)).toBeInTheDocument();
    expect(screen.queryByText("No conversations yet")).toBeNull();
  });
});
