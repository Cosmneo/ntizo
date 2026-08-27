import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Message } from "@/features/messaging/domain/types";
import { ThreadView } from "../thread-view";

const base: Message = {
  id: "m1",
  threadId: "t1",
  senderUserId: "customer-1",
  body: "Olá, ainda tem disponibilidade para sexta?",
  readAt: null,
  createdAt: "2026-08-20T09:00:00Z",
};

describe("ThreadView", () => {
  it("renders a message body as text, never as markup", () => {
    // A hostile body an attacker fully controls — this is the other party's
    // typed text, rendered on a screen that is not theirs. See this
    // component's own doc comment on why the only thing standing between
    // this and a stored XSS is `{message.body}` landing in an ordinary JSX
    // text child.
    render(
      <ThreadView messages={[{ ...base, body: "<img src=x onerror=alert(1)>" }]} />,
    );

    expect(screen.queryByRole("img")).toBeNull();
    expect(
      screen.getByText("<img src=x onerror=alert(1)>"),
    ).toBeInTheDocument();
  });

  it("shows the other side's messages and mine differently, oldest first", () => {
    // Two messages, distinct timestamps, so ordering is actually provable —
    // a one-message fixture cannot tell a correct render from a truncated
    // or reversed one.
    const theirs: Message = {
      ...base,
      id: "m1",
      senderUserId: "provider-1",
      body: "Sim, sexta às 14h está livre.",
      createdAt: "2026-08-20T09:00:00Z",
    };
    const mine: Message = {
      ...base,
      id: "m2",
      senderUserId: "customer-1",
      body: "Perfeito, marque para mim.",
      createdAt: "2026-08-20T09:05:00Z",
    };

    // Passed newest-first, the order `useThread` actually hands back — the
    // component is the one responsible for re-sorting to oldest-first.
    render(<ThreadView messages={[mine, theirs]} viewerUserId="customer-1" />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    // Oldest ("theirs") first, then "mine" — proves the re-sort, not just
    // that both bodies appear somewhere.
    expect(items[0]).toHaveTextContent("Sim, sexta às 14h está livre.");
    expect(items[1]).toHaveTextContent("Perfeito, marque para mim.");

    // "Mine" and "theirs" render with different alignment — the only
    // distinction this component draws, on purpose (see its doc comment: no
    // sender-name copy is needed when alignment already says who sent it).
    expect(items[0]?.className).toContain("justify-start");
    expect(items[1]?.className).toContain("justify-end");
  });

  it("renders every bubble as 'theirs' when no viewer id is known", () => {
    render(<ThreadView messages={[base]} />);
    expect(screen.getByRole("listitem").className).toContain("justify-start");
  });

  it("shows an empty-conversation prompt rather than a blank panel for a just-started thread", () => {
    // `StartThreadCommand` opens a thread with zero messages — the very
    // first thing a customer sees after the "message this provider" button
    // navigates them here. A blank panel would read as broken, not as "say
    // something first".
    render(<ThreadView messages={[]} />);
    expect(screen.getByText("Say hello")).toBeInTheDocument();
  });

  it("asks for more only when there is more, and calls back on click", async () => {
    const onLoadMore = vi.fn();
    render(<ThreadView messages={[base]} hasMore onLoadMore={onLoadMore} />);

    const button = screen.getByRole("button", { name: /load earlier messages/i });
    button.click();
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("renders no 'load earlier' control when there is nothing earlier to load", () => {
    render(<ThreadView messages={[base]} hasMore={false} />);
    expect(screen.queryByRole("button", { name: /load earlier messages/i })).toBeNull();
  });
});
