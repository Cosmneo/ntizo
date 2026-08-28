import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Search } from "lucide-react";
import { BrowseHero, BrowseSearchCard, BrowseSearchField } from "../browse-hero";

type HeroProps = Parameters<typeof BrowseHero>[0];

const hero = (over: Partial<HeroProps> = {}) => (
  <BrowseHero
    title="Services ready to book"
    subtitle="Price and duration settled up front."
    search={<div data-testid="search" />}
    {...over}
  />
);

describe("BrowseHero", () => {
  it("carries the page's only h1", () => {
    // These pages are built to rank. Two h1s, or none, is the one structural
    // mistake that costs on a page whose whole job is to be found.
    render(hero());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Services ready to book");
  });

  it("does not clip what deliberately hangs out of it", () => {
    // `overflow: hidden` to contain the halo cut the search card in half — and
    // the search card exists precisely to escape the band. The halo is sized
    // inside the hero instead. This was hit and fixed in the mockup.
    const { container } = render(hero());
    expect(container.firstElementChild?.className).not.toContain("overflow-hidden");
  });

  it("gives the search slot no stacking context of its own", () => {
    // The slot holds the phone's search sheet as well as the card, and a
    // `z-index` here is a stacking context around both: the sheet came up at
    // `z-50` inside a `z-10` layer, which put it *under* the filter bar at
    // `z-30`. The card stays in front of the rail because the rail paints its
    // band from a static element — see `CategoryRail` — not because of this.
    render(hero({ search: <div data-testid="search" /> }));
    const slot = screen.getByTestId("search").parentElement!;
    expect(slot.className).toContain("relative");
    expect(slot.className).not.toMatch(/(^|\s)z-\d/);
  });

});

describe("BrowseSearchCard", () => {
  const card = (fields: React.ReactNode) => (
    <BrowseSearchCard action={<button type="submit">Search</button>}>{fields}</BrowseSearchCard>
  );

  it("is a search landmark", () => {
    render(card(<BrowseSearchField icon={Search} label="Service" value="What do you need?" />));
    expect(screen.getByRole("search")).toBeInTheDocument();
  });

  it("labels each field, so the fields are not two identical boxes", () => {
    render(
      card(
        <>
          <BrowseSearchField icon={Search} label="Service" value="What do you need?" />
          <BrowseSearchField icon={Search} label="City" value="Maputo, Matola…" />
        </>,
      ),
    );
    expect(screen.getByText("Service")).toBeInTheDocument();
    expect(screen.getByText("City")).toBeInTheDocument();
  });

  it("is not drawn at all below md, where the trigger takes over", () => {
    // The two are a pair: this carries `hidden md:block` and
    // `MobileSearchTrigger` carries `md:hidden`, so one of them is on screen at
    // every width and never both. Strip either half and both appear at 360px.
    render(card(<BrowseSearchField icon={Search} label="Service" value="What do you need?" />));
    const form = screen.getByRole("search");
    expect(form.className).toContain("hidden");
    expect(form.className).toContain("md:block");
  });

  it("stacks on a phone rather than squeezing three controls into 360px", () => {
    const { container } = render(
      card(<BrowseSearchField icon={Search} label="Service" value="What do you need?" />),
    );
    const grid = container.querySelector("[data-testid='search-grid']")!;
    expect(grid.className).toContain("grid-cols-1");
    expect(grid.className).toContain("md:grid-cols-");
  });
});
