import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Thread } from "@/features/messaging/domain/types";
import { ThreadList } from "../thread-list";

/** Two rows, distinct timestamps — a one-row fixture cannot prove order. */
const older: Thread = {
  id: "t1",
  type: "inquiry",
  providerId: "p1",
  providerName: "Barbearia Central",
  customerName: "Ana Silva",
  lastMessageAt: "2026-08-20T09:00:00Z",
  lastMessagePreview: "Olá, ainda tem vaga?",
  lastMessageHasAttachment: false,
  unreadCount: 3,
  support: null,
};
const newer: Thread = {
  id: "t2",
  type: "inquiry",
  providerId: "p2",
  providerName: "Studio Beleza",
  customerName: "Carlos Mendes",
  lastMessageAt: "2026-08-21T10:00:00Z",
  lastMessagePreview: "Confirmado para sexta.",
  lastMessageHasAttachment: false,
  unreadCount: 0,
  support: null,
};
const supportRow: Thread = {
  id: "t5",
  type: "support",
  providerId: null,
  providerName: "",
  customerName: "Ana Silva",
  lastMessageAt: "2026-08-22T11:00:00Z",
  lastMessagePreview: "Paguei duas vezes pelo mesmo serviço.",
  lastMessageHasAttachment: false,
  unreadCount: 0,
  support: { subject: "Reembolso", status: "open", audience: "customer", bookingId: null },
};

function noop() {}

describe("ThreadList", () => {
  it("renders every thread it is given, in the order it is given", () => {
    render(
      <ThreadList
        threads={[older, newer]}
        loading={false}
        selectedThreadId={null}
        onSelect={noop}
        hasMore={false}
        onLoadMore={noop}
        locale="en-US"
      />,
    );
    const rows = screen.getAllByRole("button").filter((b) => b.textContent?.includes("Central") || b.textContent?.includes("Beleza"));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Barbearia Central");
    expect(rows[1]).toHaveTextContent("Studio Beleza");
  });

  it("shows the unread count only for a thread that actually has one", () => {
    render(
      <ThreadList
        threads={[older, newer]}
        loading={false}
        selectedThreadId={null}
        onSelect={noop}
        hasMore={false}
        onLoadMore={noop}
        locale="en-US"
      />,
    );
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByLabelText("3 unread messages")).toBeInTheDocument();
    // `newer` has `unreadCount: 0` — no badge rendered for it at all, not a
    // badge showing "0".
    expect(screen.queryByText("0")).toBeNull();
  });

  it("marks the selected thread's row so it can be styled apart from the rest", () => {
    render(
      <ThreadList
        threads={[older, newer]}
        loading={false}
        selectedThreadId="t2"
        onSelect={noop}
        hasMore={false}
        onLoadMore={noop}
        locale="en-US"
      />,
    );
    expect(screen.getByText("Studio Beleza").closest("button")).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByText("Barbearia Central").closest("button")).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("calls back with the clicked thread's id", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <ThreadList
        threads={[older, newer]}
        loading={false}
        selectedThreadId={null}
        onSelect={onSelect}
        hasMore={false}
        onLoadMore={noop}
        locale="en-US"
      />,
    );
    await user.click(screen.getByText("Studio Beleza"));
    expect(onSelect).toHaveBeenCalledWith("t2");
  });

  it("falls back to a placeholder name and preview for a degraded row", () => {
    // `Thread`'s own doc comment: `providerName`/`lastMessagePreview` land
    // empty when the backend's enrichment lookup misses, not never. This is
    // the GENUINE "nothing to show" case — `lastMessageHasAttachment: false`
    // is what tells it apart from the caption-less-photo case below, where
    // `lastMessagePreview` is empty for an entirely different reason.
    const degraded: Thread = {
      ...older,
      id: "t3",
      providerName: "",
      lastMessagePreview: "",
      lastMessageHasAttachment: false,
    };
    render(
      <ThreadList
        threads={[degraded]}
        loading={false}
        selectedThreadId={null}
        onSelect={noop}
        hasMore={false}
        onLoadMore={noop}
        locale="en-US"
      />,
    );
    expect(screen.getByText("Provider")).toBeInTheDocument();
    expect(screen.getByText("No messages yet")).toBeInTheDocument();
    expect(screen.queryByText("Sent an attachment")).toBeNull();
  });

  /**
   * The Important finding from the whole-branch review: a caption-less
   * photo (`Message.compose` allows an empty body when an attachment rides
   * along, since Task 2) used to render "No messages yet" — the exact same
   * text as the genuinely-empty case above — right next to a bold unread
   * badge, on a thread just sorted to the top. `lastMessageHasAttachment` is
   * what the preview reads to tell the two apart; `lastMessagePreview` alone
   * cannot.
   */
  it("shows an attachment marker, not 'no messages yet', when the latest message is a caption-less photo", () => {
    const photoOnly: Thread = {
      ...older,
      id: "t4",
      lastMessagePreview: "",
      lastMessageHasAttachment: true,
    };
    render(
      <ThreadList
        threads={[photoOnly]}
        loading={false}
        selectedThreadId={null}
        onSelect={noop}
        hasMore={false}
        onLoadMore={noop}
        locale="en-US"
      />,
    );
    expect(screen.getByText("Sent an attachment")).toBeInTheDocument();
    expect(screen.queryByText("No messages yet")).toBeNull();
  });

  it("labels each row with customerName instead of providerName when the caller asks for it", () => {
    // `provider-messages-page.tsx`'s whole reason for this prop: on a
    // provider's own inbox, `providerName` is this workspace's own name —
    // identical on every row — and would say nothing about who each
    // conversation is with. `nameOf` is how that page selects the field
    // that actually distinguishes the rows.
    render(
      <ThreadList
        threads={[older, newer]}
        loading={false}
        selectedThreadId={null}
        onSelect={noop}
        hasMore={false}
        onLoadMore={noop}
        locale="en-US"
        nameOf={(thread) => thread.customerName}
      />,
    );
    expect(screen.getByText("Ana Silva")).toBeInTheDocument();
    expect(screen.getByText("Carlos Mendes")).toBeInTheDocument();
    // The field `nameOf` was told NOT to read must not leak onto the row.
    expect(screen.queryByText("Barbearia Central")).toBeNull();
    expect(screen.queryByText("Studio Beleza")).toBeNull();
  });

  it("labels a support row with its subject and status instead of a provider name", () => {
    render(
      <ThreadList
        threads={[supportRow]}
        loading={false}
        selectedThreadId={null}
        onSelect={noop}
        hasMore={false}
        onLoadMore={noop}
        locale="en-US"
      />,
    );

    expect(screen.getByText("Reembolso")).toBeInTheDocument();
    expect(screen.getByText("Ntizo Support")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
  });

  it("falls back to the caller's own fallbackName, not the hardcoded default, when the selected field is empty", () => {
    const degraded: Thread = { ...older, id: "t3", customerName: "" };
    render(
      <ThreadList
        threads={[degraded]}
        loading={false}
        selectedThreadId={null}
        onSelect={noop}
        hasMore={false}
        onLoadMore={noop}
        locale="en-US"
        nameOf={(thread) => thread.customerName}
        fallbackName="Custom fallback"
      />,
    );
    expect(screen.getByText("Custom fallback")).toBeInTheDocument();
    // Not the hardcoded "Provider" default this component would otherwise
    // fall back to — the caller asked for a different one.
    expect(screen.queryByText("Provider")).toBeNull();
  });

  it("shows a loading skeleton instead of the list while loading", () => {
    render(
      <ThreadList
        threads={[]}
        loading
        selectedThreadId={null}
        onSelect={noop}
        hasMore={false}
        onLoadMore={noop}
        locale="en-US"
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText(/no conversations/i)).toBeNull();
  });

  it("shows the empty state only once loading has actually finished", () => {
    render(
      <ThreadList
        threads={[]}
        loading={false}
        selectedThreadId={null}
        onSelect={noop}
        hasMore={false}
        onLoadMore={noop}
        locale="en-US"
      />,
    );
    expect(screen.getByText("No conversations yet")).toBeInTheDocument();
  });

  it("uses the given empty-state copy instead of the namespace default when the caller provides one", () => {
    // `provider-messages-page.tsx` passes its own `emptyBody` — a provider's
    // inbox means something different by "no conversations yet" than the
    // customer's own ("start one from any provider's page…", which is false
    // for a provider — nobody on this side starts a thread).
    render(
      <ThreadList
        threads={[]}
        loading={false}
        selectedThreadId={null}
        onSelect={noop}
        hasMore={false}
        onLoadMore={noop}
        locale="en-US"
        emptyTitle="Custom title"
        emptyBody="Custom body"
      />,
    );
    expect(screen.getByText("Custom title")).toBeInTheDocument();
    expect(screen.getByText("Custom body")).toBeInTheDocument();
    expect(screen.queryByText("No conversations yet")).toBeNull();
  });

  it("offers to load more only when there is more, and calls back on click", async () => {
    const onLoadMore = vi.fn();
    const user = userEvent.setup();
    render(
      <ThreadList
        threads={[older]}
        loading={false}
        selectedThreadId={null}
        onSelect={noop}
        hasMore
        onLoadMore={onLoadMore}
        locale="en-US"
      />,
    );
    await user.click(screen.getByRole("button", { name: /load more/i }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("renders no 'load more' control when there is nothing more to load", () => {
    render(
      <ThreadList
        threads={[older]}
        loading={false}
        selectedThreadId={null}
        onSelect={noop}
        hasMore={false}
        onLoadMore={noop}
        locale="en-US"
      />,
    );
    expect(screen.queryByRole("button", { name: /load more/i })).toBeNull();
  });
});
