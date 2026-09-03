import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
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
    // At least one of each: `CompanyPage` renders the footer too, which now
    // carries its own "Talk to support" button and its own copy of the
    // support address, so this page's contact section is not the only place
    // either appears.
    expect(screen.getAllByRole("button", { name: /talk to support/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /suporte@ntizo\.co\.mz/ }).length).toBeGreaterThan(0);
  });
});
