import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { SectionHead } from "../section-head";

async function renderHead(props: Parameters<typeof SectionHead>[0]) {
  const root = createRootRoute({ component: () => <SectionHead {...props} /> });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return render(<RouterProvider router={router} />);
}

const BLURB = "Escolha um ofício para ver quem trabalha nele.";

describe("SectionHead", () => {
  /**
   * jsdom does no layout, so the squeeze itself is not assertable — the
   * direction that causes it is.
   *
   * What a phone showed: the title, its line and the "see all" link shared one
   * 390px row, so the blurb was left three words wide and ran down four ragged
   * lines beside a link that had taken its own share of the width. Every
   * section on the home page had it.
   */
  it("stacks its parts on a phone and only becomes a row when there is room", async () => {
    const { container } = await renderHead({
      title: "Explorar por categoria",
      blurb: BLURB,
      more: { label: "Todas as categorias", to: "/services" },
    });

    const head = container.querySelector("div")!;
    expect(head.className).toContain("flex-col");
    expect(head.className).toContain("sm:flex-row");
    // The row's own alignment must not apply while stacked, or the link sits
    // on the blurb's baseline in a column and reads as part of the sentence.
    expect(head.className).toContain("items-start");
    expect(head.className).toContain("sm:items-end");
    expect(head.className).toContain("sm:justify-between");
  });

  it("keeps the title, the line and the way out, whatever the width", async () => {
    await renderHead({
      title: "Serviços populares",
      blurb: "Preço e duração fixos.",
      more: { label: "Ver todos os serviços", to: "/services" },
    });

    expect(screen.getByRole("heading", { name: "Serviços populares" })).toBeInTheDocument();
    expect(screen.getByText("Preço e duração fixos.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ver todos os serviços/ })).toHaveAttribute(
      "href",
      "/services",
    );
  });

  it("draws no line and no way out when the section has neither", async () => {
    await renderHead({ title: "O que dizem os clientes" });

    expect(screen.getByRole("heading", { name: "O que dizem os clientes" })).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
