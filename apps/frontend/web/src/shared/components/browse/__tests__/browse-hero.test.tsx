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

  it("renders no kicker when none was given", () => {
    const { container } = render(hero());
    expect(container.querySelector("[data-testid='hero-kicker']")).toBeNull();
  });

  it("renders the kicker when one was given", () => {
    render(hero({ kicker: { badge: "No haggling", body: "price settled before you book" } }));
    expect(screen.getByText("No haggling")).toBeInTheDocument();
    expect(screen.getByText("price settled before you book")).toBeInTheDocument();
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

  it("stacks on a phone rather than squeezing three controls into 360px", () => {
    const { container } = render(
      card(<BrowseSearchField icon={Search} label="Service" value="What do you need?" />),
    );
    const grid = container.querySelector("[data-testid='search-grid']")!;
    expect(grid.className).toContain("grid-cols-1");
    expect(grid.className).toContain("md:grid-cols-");
  });
});
