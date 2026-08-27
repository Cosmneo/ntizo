import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MESSAGE_BODY_MAX_LENGTH } from "@/features/messaging/domain/types";
import { MessageComposer } from "../message-composer";

describe("MessageComposer", () => {
  it("refuses to send an empty body", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<MessageComposer onSend={onSend} />);

    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(onSend).not.toHaveBeenCalled();
  });

  it("refuses to send a body that is only whitespace", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<MessageComposer onSend={onSend} />);

    await user.type(screen.getByPlaceholderText(/write a message/i), "   ");
    // The button is disabled for whitespace-only input — same guard the
    // server's own `.trim().min(1)` enforces, just earlier.
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(onSend).not.toHaveBeenCalled();
  });

  it("sends the trimmed body and clears the field", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<MessageComposer onSend={onSend} />);

    const field = screen.getByPlaceholderText(/write a message/i);
    await user.type(field, "  Olá, tudo bem?  ");
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("Olá, tudo bem?");
    expect(field).toHaveValue("");
  });

  it("stops someone at the server's own character bound, not after they hit send", () => {
    // The field itself caps input at `MESSAGE_BODY_MAX_LENGTH` — the same
    // 4000 the server's `.max(4000)` refuses past. Asserted on the
    // `maxLength` attribute rather than by typing 4001 characters through
    // `userEvent`, which would exercise the exact same code path far more
    // slowly for no extra confidence.
    render(<MessageComposer onSend={vi.fn()} />);
    expect(screen.getByPlaceholderText(/write a message/i)).toHaveAttribute(
      "maxLength",
      String(MESSAGE_BODY_MAX_LENGTH),
    );
  });

  it("shows a live character count", async () => {
    const user = userEvent.setup();
    render(<MessageComposer onSend={vi.fn()} />);
    await user.type(screen.getByPlaceholderText(/write a message/i), "Olá");
    expect(screen.getByText(`3/${MESSAGE_BODY_MAX_LENGTH}`)).toBeInTheDocument();
  });

  it("disables the field and shows the sending label while a send is in flight", () => {
    render(<MessageComposer onSend={vi.fn()} sending />);
    expect(screen.getByRole("button", { name: /sending/i })).toBeDisabled();
  });

  it("shows the sentence for a known send error", () => {
    render(<MessageComposer onSend={vi.fn()} errorCode="VALIDATION_ERROR" />);
    expect(
      screen.getByRole("alert").textContent,
    ).toMatch(/4000 characters/i);
  });

  it("falls back to a generic sentence for an error code it does not recognise", () => {
    render(<MessageComposer onSend={vi.fn()} errorCode="SOMETHING_NEW" />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    // Never the coarse wire code some future refactor might pass through by
    // mistake — this composer only ever branches on the specific domain
    // codes `messagingErrorCode` resolves to, documented in
    // `use-send-message.ts`. `UNPROCESSABLE` never arrives there and must
    // never leak into this component's rendered text either.
    expect(screen.getByRole("alert").textContent).not.toMatch(/UNPROCESSABLE/);
  });

  it("renders no error banner when there is nothing wrong", () => {
    render(<MessageComposer onSend={vi.fn()} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
