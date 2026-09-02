import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import i18n from "@/shared/lib/i18n";
import { CheckoutHeader } from "../checkout-header";
import type { CheckoutStep } from "../checkout-steps";

/**
 * The bar above every checkout page, on its own.
 *
 * What it promises is mostly what it leaves out: the site's navigation pill,
 * the bell, the account menu. A purchase in progress is the one place those
 * are an invitation to wander off with a slot on hold, and the three page
 * suites drive the whole page rather than the bar, so this is where the
 * absence is stated.
 */
async function renderHeader(current: CheckoutStep) {
  const root = createRootRoute({ component: () => <CheckoutHeader current={current} /> });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
}

beforeEach(async () => {
  await i18n.changeLanguage("pt-MZ");
});

afterEach(async () => {
  await i18n.changeLanguage("en-US");
});

describe("CheckoutHeader", () => {
  it("carries the steps, so the page body does not have to", async () => {
    await renderHeader("details");

    const steps = screen.getByRole("navigation", { name: "Etapas da reserva" });
    expect(steps).toBeInTheDocument();
    expect(screen.getByText("Passo 2 de 3")).toBeInTheDocument();
    expect(screen.getByText("Detalhes")).toHaveAttribute("aria-current", "step");
  });

  it("keeps the logo as the one way home", async () => {
    await renderHeader("when");

    expect(screen.getByRole("link", { name: "Ntizo" })).toHaveAttribute("href", "/");
  });

  it("says the checkout is secure", async () => {
    await renderHeader("confirm");

    expect(screen.getByText("Reserva segura")).toBeInTheDocument();
  });

  it("has no site navigation and no account controls", async () => {
    await renderHeader("when");

    // The public pill's three destinations, and the account cluster's two.
    for (const name of [/explorar/i, /serviços/i, /prestadores/i, /notifica/i, /entrar/i]) {
      expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
    }
    expect(screen.getAllByRole("navigation")).toHaveLength(1);
  });
});
