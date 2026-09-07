import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/shared/lib/i18n";
import { QuoteAttachmentPicker } from "@/features/quotes/ui/attachment-picker";

beforeEach(async () => { await i18n.changeLanguage("pt-MZ"); });

const file = (name: string) => ({ id: name, file: new File(["x"], name, { type: "image/png" }), errorKey: null });

describe("QuoteAttachmentPicker", () => {
  it("shows the label the caller gave it, not a paperclip", async () => {
    render(<QuoteAttachmentPicker inputId="p" label="Juntar fotos" files={[]} onAdd={vi.fn()} onRemove={vi.fn()} />);
    expect(await screen.findByText("Juntar fotos")).toBeInTheDocument();
  });

  it("lists what has been picked and offers to remove each one by name", async () => {
    const onRemove = vi.fn();
    render(<QuoteAttachmentPicker inputId="p" label="Juntar fotos"
      files={[file("parede.png")]} onAdd={vi.fn()} onRemove={onRemove} />);
    expect(await screen.findByText("parede.png")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remover parede.png" }));
    expect(onRemove).toHaveBeenCalledWith("parede.png");
  });

  it("says so and stops accepting once five files are picked", async () => {
    const files = ["a", "b", "c", "d", "e"].map(file);
    render(<QuoteAttachmentPicker inputId="p" label="Juntar fotos" files={files} onAdd={vi.fn()} onRemove={vi.fn()} />);
    expect(await screen.findByText("No máximo 5 ficheiros.")).toBeInTheDocument();
    expect(screen.getByLabelText("Juntar fotos")).toBeDisabled();
  });

  it("shows a rejected file's own reason, in the messaging namespace's words", async () => {
    render(<QuoteAttachmentPicker inputId="p" label="Juntar fotos"
      files={[{ ...file("grande.png"), errorKey: "attachmentError.TOO_LARGE" }]}
      onAdd={vi.fn()} onRemove={vi.fn()} />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
