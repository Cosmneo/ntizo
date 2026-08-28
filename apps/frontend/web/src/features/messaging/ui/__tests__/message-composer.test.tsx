import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MESSAGE_BODY_MAX_LENGTH } from "@/features/messaging/domain/types";
import { MessageComposer } from "../message-composer";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function fileNamed(name: string, type = "image/jpeg"): File {
  return new File(["x"], name, { type });
}

/**
 * Stubs `fetch` for the upload leg, the same seam `avatar.repository.test.ts`
 * uses — a `ui/` test file cannot import `data/attachment.repository`
 * directly (`boundaries/dependencies` forbids `ui/` -> `data/`, the same
 * rule `customer-messages-page.test.tsx`'s own doc comment documents), so
 * this exercises the real `MessageComposer` -> `useAttachments` ->
 * `uploadAttachment` -> `fetch` path end to end rather than mocking any one
 * link of it.
 */
function stubUpload(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

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
    expect(onSend).toHaveBeenCalledWith("Olá, tudo bem?", []);
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
    // it at all. `search-box.tsx` pairs its placeholder with a distinct
    // `aria-label`; this field follows the same convention.
    render(<MessageComposer onSend={vi.fn()} />);
    expect(screen.getByRole("textbox", { name: /message body/i })).toBeInTheDocument();
  });

  describe("the contact warning", () => {
    it("warns while typing, not on submit", async () => {
      // The whole point: finding out a message is invalid only after
      // writing it is the worst moment to learn it. This never clicks send.
      const user = userEvent.setup();
      render(<MessageComposer onSend={vi.fn()} />);

      await user.type(
        screen.getByPlaceholderText(/write a message/i),
        "call me at 84 123 4567",
      );

      expect(screen.getByRole("alert")).toHaveTextContent(
        /contact details aren't allowed/i,
      );
    });

    it("refuses to send a message containing a phone number", async () => {
      const onSend = vi.fn();
      const user = userEvent.setup();
      render(<MessageComposer onSend={onSend} />);

      await user.type(screen.getByPlaceholderText(/write a message/i), "841234567");
      await user.click(screen.getByRole("button", { name: /send/i }));

      expect(onSend).not.toHaveBeenCalled();
    });

    it("disables the send button while a contact is present, not just refuses on click", async () => {
      const user = userEvent.setup();
      render(<MessageComposer onSend={vi.fn()} />);

      await user.type(screen.getByPlaceholderText(/write a message/i), "841234567");

      expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
    });

    it("shows no warning for an ordinary body with no contact in it", async () => {
      const user = userEvent.setup();
      render(<MessageComposer onSend={vi.fn()} />);

      await user.type(screen.getByPlaceholderText(/write a message/i), "See you Friday!");

      expect(screen.queryByRole("alert")).toBeNull();
    });
  });

  describe("attachments", () => {
    it("gives the attach control an accessible name", () => {
      render(<MessageComposer onSend={vi.fn()} />);
      expect(screen.getByLabelText(/attach a file/i)).toBeInTheDocument();
    });

    it("adds a picked file to the preview list", async () => {
      const user = userEvent.setup();
      render(<MessageComposer onSend={vi.fn()} />);

      await user.upload(screen.getByLabelText(/attach a file/i), fileNamed("foto.jpg"));

      expect(screen.getByText("foto.jpg")).toBeInTheDocument();
    });

    it("lets a picked file be removed again", async () => {
      const user = userEvent.setup();
      render(<MessageComposer onSend={vi.fn()} />);

      await user.upload(screen.getByLabelText(/attach a file/i), fileNamed("foto.jpg"));
      await user.click(screen.getByRole("button", { name: /remove foto\.jpg/i }));

      expect(screen.queryByText("foto.jpg")).toBeNull();
    });

    it("refuses a file whose name carries a phone number", async () => {
      // The exact bypass `hasContact` on the file name exists to close: a
      // client-side body check alone is one curl away from irrelevant, and
      // a file name is the obvious way around a rule that only ever looked
      // at the body.
      const user = userEvent.setup();
      render(<MessageComposer onSend={vi.fn()} />);

      await user.upload(
        screen.getByLabelText(/attach a file/i),
        fileNamed("liga-me-841234567.jpg"),
      );

      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    it("blocks sending while a picked file still has an error", async () => {
      const onSend = vi.fn();
      const user = userEvent.setup();
      render(<MessageComposer onSend={onSend} />);

      await user.upload(
        screen.getByLabelText(/attach a file/i),
        fileNamed("liga-me-841234567.jpg"),
      );
      await user.type(screen.getByPlaceholderText(/write a message/i), "Olá");

      expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
      expect(onSend).not.toHaveBeenCalled();
    });

    it("uploads picked files on submit and sends onSend their storageKey/fileName descriptors, never contentType or sizeBytes", async () => {
      stubUpload(201, {
        storageKey: "attachment/u1/1-a",
        fileName: "foto.jpg",
        contentType: "image/jpeg",
        sizeBytes: 12_345,
      });

      const onSend = vi.fn();
      const user = userEvent.setup();
      render(<MessageComposer onSend={onSend} />);

      await user.upload(screen.getByLabelText(/attach a file/i), fileNamed("foto.jpg"));
      await user.type(screen.getByPlaceholderText(/write a message/i), "Olha isto");
      await user.click(screen.getByRole("button", { name: /send/i }));

      await waitFor(() => expect(onSend).toHaveBeenCalled());
      expect(onSend).toHaveBeenCalledWith("Olha isto", [
        { storageKey: "attachment/u1/1-a", fileName: "foto.jpg" },
      ]);
    });

    it("sends a caption-less message when only a file is attached — a photo needs no caption", async () => {
      stubUpload(201, {
        storageKey: "attachment/u1/1-a",
        fileName: "foto.jpg",
        contentType: "image/jpeg",
        sizeBytes: 12_345,
      });

      const onSend = vi.fn();
      const user = userEvent.setup();
      render(<MessageComposer onSend={onSend} />);

      await user.upload(screen.getByLabelText(/attach a file/i), fileNamed("foto.jpg"));
      // The button must not be disabled by an empty body when a file is
      // picked — the server's own rule since `MessageEmptyError` changed.
      expect(screen.getByRole("button", { name: /send/i })).toBeEnabled();
      await user.click(screen.getByRole("button", { name: /send/i }));

      await waitFor(() => expect(onSend).toHaveBeenCalled());
      expect(onSend).toHaveBeenCalledWith("", [
        { storageKey: "attachment/u1/1-a", fileName: "foto.jpg" },
      ]);
    });

    it("does not call onSend, and shows why, when the server refuses the upload", async () => {
      stubUpload(413, { error: "TOO_LARGE" });

      const onSend = vi.fn();
      const user = userEvent.setup();
      render(<MessageComposer onSend={onSend} />);

      await user.upload(screen.getByLabelText(/attach a file/i), fileNamed("foto.jpg"));
      await user.click(screen.getByRole("button", { name: /send/i }));

      await waitFor(() =>
        expect(screen.getByText(/larger than 10 mb/i)).toBeInTheDocument(),
      );
      expect(onSend).not.toHaveBeenCalled();
    });
  });
});
