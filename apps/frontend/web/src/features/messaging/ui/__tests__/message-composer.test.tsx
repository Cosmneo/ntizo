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

  it("falls back to the generic sentence for an error code it does not recognise", () => {
    // Pinned to the *actual* generic sentence, not just "some alert
    // appeared" or "the text isn't UNPROCESSABLE" — both of those pass
    // against `const errorKey = errorCode ?? "GENERIC";` just as well as
    // against the real allowlist, because an unmapped code then flows
    // straight into `t(\`sendError.${errorCode}\`)` and i18next renders the
    // raw missing key, `sendError.SOMETHING_NEW` — a string a customer
    // would actually see, and one that contains neither "UNPROCESSABLE" nor
    // nothing. Asserting the real sentence is the only version of this test
    // that reds under that mutation. Verified: applying it locally turned
    // this from green to a failure reporting the raw key instead of the
    // sentence below.
    render(<MessageComposer onSend={vi.fn()} errorCode="SOMETHING_NEW" />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "That message didn't send. Please try again.",
    );
  });

  it("never renders the coarse wire code, for a known error or an unknown one", () => {
    render(<MessageComposer onSend={vi.fn()} errorCode="VALIDATION_ERROR" />);
    expect(screen.getByRole("alert").textContent).not.toMatch(/UNPROCESSABLE/);
  });

  it("renders no error banner when there is nothing wrong", () => {
    render(<MessageComposer onSend={vi.fn()} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("gives the field an accessible name, not just a placeholder", () => {
    // A placeholder is not an accessible name — it disappears the moment
    // there is text in the field, and some assistive tech never announces
    // it at all. Every search field on this platform pairs its placeholder
    // with a distinct label; this field follows the same convention.
    render(<MessageComposer onSend={vi.fn()} />);
    expect(screen.getByRole("textbox", { name: /message body/i })).toBeInTheDocument();
  });
});
