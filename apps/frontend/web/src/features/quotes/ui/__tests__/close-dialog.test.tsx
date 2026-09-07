import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QUOTE_CUSTOMER_REJECT_REASONS } from "@ntizo/shared";
import i18n from "@/shared/lib/i18n";
import { CloseQuoteDialog } from "../close-dialog";

beforeEach(async () => {
  await i18n.changeLanguage("pt-MZ");
});

describe("CloseQuoteDialog", () => {
  it("offers the reasons it was given and nothing else", async () => {
    render(
      <CloseQuoteDialog
        kind="reject"
        reasons={QUOTE_CUSTOMER_REJECT_REASONS}
        otherName="Frio & Clima Maputo"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
        busy={false}
      />,
    );
    expect(await screen.findByRole("radio", { name: "Está acima do meu orçamento" })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Fora da minha zona" })).not.toBeInTheDocument();
  });

  it("hands back the reason, the note and the files together", async () => {
    const onConfirm = vi.fn();
    render(
      <CloseQuoteDialog
        kind="reject"
        reasons={QUOTE_CUSTOMER_REJECT_REASONS}
        otherName="Frio & Clima"
        onConfirm={onConfirm}
        onClose={vi.fn()}
        busy={false}
      />,
    );
    await userEvent.click(await screen.findByRole("radio", { name: "A data não me serve" }));
    await userEvent.type(screen.getByLabelText(/Nota/), "Estou fora nesse fim-de-semana.");
    await userEvent.click(screen.getByRole("button", { name: "Recusar proposta" }));
    expect(onConfirm).toHaveBeenCalledWith({
      reason: "wrong_time",
      note: "Estou fora nesse fim-de-semana.",
      files: [],
    });
  });

  it("has no reason list at all when it is a withdrawal, because there is no token for one", async () => {
    render(
      <CloseQuoteDialog
        kind="withdraw"
        reasons={null}
        otherName="Frio & Clima"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
        busy={false}
      />,
    );
    expect(await screen.findByRole("button", { name: "Retirar pedido" })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  it("refuses a note carrying a contact before it sends anything", async () => {
    const onConfirm = vi.fn();
    render(
      <CloseQuoteDialog
        kind="withdraw"
        reasons={null}
        otherName="Frio & Clima"
        onConfirm={onConfirm}
        onClose={vi.fn()}
        busy={false}
      />,
    );
    await userEvent.type(await screen.findByLabelText(/Nota/), "Ligue 84 123 4567");
    await userEvent.click(screen.getByRole("button", { name: "Retirar pedido" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Tire o número de telefone/);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("stays open and says nothing changed when the write reports a lost race", async () => {
    render(
      <CloseQuoteDialog
        kind="reject"
        reasons={QUOTE_CUSTOMER_REJECT_REASONS}
        otherName="Frio & Clima"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
        busy={false}
        notice="close.errorMoved"
      />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Isto mudou entretanto. Voltámos a carregar.");
  });
});
