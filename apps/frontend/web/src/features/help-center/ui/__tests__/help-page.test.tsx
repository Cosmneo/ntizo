import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderHelpPage } from "./render-help-page";

describe("HelpPage", () => {
  it("lists every category and every question", async () => {
    await renderHelpPage();

    expect(screen.getByRole("heading", { name: /customers/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /providers/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /payments and safety/i })).toBeInTheDocument();
    // Twenty questions, each its own toggle.
    expect(screen.getAllByRole("button", { expanded: false })).toHaveLength(20);
  });

  it("opens an answer when its question is clicked", async () => {
    const user = userEvent.setup();
    await renderHelpPage();

    await user.click(screen.getByRole("button", { name: /when do I pay/i }));
    expect(screen.getByText(/after the provider confirms the time/i)).toBeInTheDocument();
  });

  it("carries a heading with an anchor per category so a link can point at one", async () => {
    await renderHelpPage();
    expect(document.getElementById("customers")).not.toBeNull();
    expect(document.getElementById("providers")).not.toBeNull();
    expect(document.getElementById("payments")).not.toBeNull();
  });

  it("offers the panel at the end rather than only an email", async () => {
    await renderHelpPage();
    // Scoped to the page's own contact section: `CompanyPage` renders the
    // footer too, which carries its own "Talk to support" button and its
    // own copy of the support address, so an unscoped query would still
    // pass even if this page's own section were deleted.
    const contactSection = screen.getByRole("heading", { name: /still need help/i }).closest("section")!;
    expect(within(contactSection).getByRole("button", { name: /talk to support/i })).toBeInTheDocument();
    expect(within(contactSection).getByRole("link", { name: /suporte@ntizo\.co\.mz/ })).toBeInTheDocument();
  });
});
