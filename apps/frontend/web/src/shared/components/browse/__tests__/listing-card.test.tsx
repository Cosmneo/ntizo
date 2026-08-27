import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LISTING_TITLE_LINK_CLASS, ListingCard } from "../listing-card";

type CardProps = Parameters<typeof ListingCard>[0];

const card = (over: Partial<CardProps> = {}) => (
  <ul>
    <ListingCard
      media={<div data-testid="media" />}
      title={
        <h3>
          <a href="/services/1" className={LISTING_TITLE_LINK_CLASS}>
            Corte de cabelo
          </a>
        </h3>
      }
      stub={
        <div>
          <a href="/services/1">Book</a>
        </div>
      }
      {...over}
    />
  </ul>
);

describe("ListingCard", () => {
  it("is a list item, so a column of results is a list", () => {
    // A screen reader announces "list, 8 items" and lets the reader skip it.
    // A column of divs announces nothing at all.
    render(card());
    expect(screen.getByRole("listitem")).toBeInTheDocument();
  });

  it("gives the whole card one destination without swallowing the buttons", () => {
    // The card is not wrapped in an anchor: an anchor cannot legally contain
    // the CTA or the favourite button, and browsers resolve the nesting by
    // dropping one of them. The title's ::after covers the surface instead.
    const { container } = render(card());
    const title = screen.getByRole("link", { name: "Corte de cabelo" });
    expect(title.className).toContain("after:absolute");
    expect(container.querySelector("li > a")).toBeNull();
  });

  it("leaves both links reachable", () => {
    render(card());
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("omits the description element entirely when there is none", () => {
    // Most providers have written none. An empty <p> still occupies its line
    // height, which is a band of white inside every card that has no text.
    const { container } = render(card());
    expect(container.querySelector("[data-testid='listing-description']")).toBeNull();
  });

  it("clamps a long description rather than letting one card set the row height", () => {
    render(card({ description: "A very long description ".repeat(40) }));
    expect(screen.getByTestId("listing-description").className).toContain("line-clamp-2");
  });

  it("renders each optional slot only when given", () => {
    const { container } = render(card());
    expect(container.querySelector("[data-testid='listing-meta']")).toBeNull();
    expect(container.querySelector("[data-testid='listing-subtitle']")).toBeNull();
    expect(container.querySelector("[data-testid='listing-tags']")).toBeNull();
  });

  it("renders the optional slots when they are given", () => {
    render(
      card({
        meta: <span>45 min</span>,
        subtitle: <span>Estúdio Mavalane</span>,
        tags: <span>Beleza</span>,
      }),
    );
    expect(screen.getByText("45 min")).toBeInTheDocument();
    expect(screen.getByText("Estúdio Mavalane")).toBeInTheDocument();
    expect(screen.getByText("Beleza")).toBeInTheDocument();
  });
});
