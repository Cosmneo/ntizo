import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PriceStub } from "../price-stub";

describe("PriceStub", () => {
  it("leads with the amount and says what kind of price it is", () => {
    render(<PriceStub eyebrow="Fixed price" amount="800 MZN" action={<a href="/x">Book</a>} />);
    expect(screen.getByText("800 MZN")).toBeInTheDocument();
    expect(screen.getByText("Fixed price")).toBeInTheDocument();
  });

  it("draws no stars for a listing nobody has reviewed", () => {
    // The gap is the point. A "0.0" where every other card has a score tells
    // every reader this is the worst listing on the platform, which is the
    // opposite of true — the same reason `ratingAverage` is null and not 0 all
    // the way from the database.
    const { container } = render(
      <PriceStub eyebrow="Fixed price" amount="800 MZN" action={<a href="/x">Book</a>} />,
    );
    expect(screen.queryByText("0,0")).not.toBeInTheDocument();
    expect(screen.queryByText("0.0")).not.toBeInTheDocument();
    expect(container.querySelector("[data-testid='stub-rating']")).toBeNull();
  });

  it("collapses without leaving a hole when the optional lines are absent", () => {
    // Every optional slot missing is the common case — most listings carry no
    // rating and no under-line — and it must not leave a band of empty space
    // where the next card in the column has content.
    const { container } = render(
      <PriceStub eyebrow="By quote" amount="To agree" action={<a href="/x">Ask</a>} />,
    );
    const stub = container.querySelector("[data-testid='price-stub']")!;
    expect(stub.querySelector("[data-testid='stub-rating']")).toBeNull();
    expect(stub.querySelector("[data-testid='stub-under']")).toBeNull();
  });

  it("carries the score, the count and one decimal", () => {
    // 4.9 from two people and 4.9 from two hundred are different claims, and a
    // bare "5" reads as a different kind of number than "4.7".
    render(
      <PriceStub
        rating={{ average: 5, count: 214 }}
        eyebrow="Fixed price"
        amount="800 MZN"
        action={<a href="/x">Book</a>}
      />,
    );
    expect(screen.getByText("5.0")).toBeInTheDocument();
    expect(screen.getByText("(214)")).toBeInTheDocument();
  });

  it("says whose score it is when it is not the listing's own", () => {
    // A service card shows the provider's rating. Printing it unlabelled
    // claims the service has been reviewed 6 times, which it has not.
    render(
      <PriceStub
        rating={{ average: 4.7, count: 6, attribution: "provider rating" }}
        eyebrow="Fixed price"
        amount="800 MZN"
        action={<a href="/x">Book</a>}
      />,
    );
    expect(screen.getByText("provider rating")).toBeInTheDocument();
  });

  it("states the score as a phrase for anyone who cannot see the stars", () => {
    // Five icons read out one by one are not a rating.
    render(
      <PriceStub
        rating={{ average: 4.7, count: 3 }}
        eyebrow="Fixed price"
        amount="800 MZN"
        action={<a href="/x">Book</a>}
      />,
    );
    expect(screen.getByLabelText("4.7 out of 5, from 3 reviews")).toBeInTheDocument();
  });

  it("turns into one row of columns on a phone, and stacks only from md up", () => {
    // The mockup's `.mstub` is `display:flex; align-items:flex-end;
    // justify-content:space-between` with a content-width CTA — one row. Built
    // as a column at every width it drew six right-aligned lines (rating,
    // attribution, eyebrow, amount, duration, a full-width button) and took
    // ~130px of a 358px-wide card against the mockup's ~56px.
    //
    // Class assertions rather than measurements because jsdom lays nothing
    // out; what is pinned is that the stacking is gated behind `md:` and the
    // row alignment is not, which is the part that regressed.
    const { container } = render(
      <PriceStub
        rating={{ average: 4.7, count: 6, attribution: "provider rating" }}
        eyebrow="Fixed price"
        amount="800 MZN"
        under="45 min"
        action={<a href="/x">Book</a>}
      />,
    );
    const stub = container.querySelector("[data-testid='price-stub']")!;
    const classes = stub.className.split(/\s+/);
    expect(classes).toContain("flex");
    expect(classes).toContain("items-end");
    expect(classes).toContain("justify-between");
    expect(classes).toContain("md:flex-col");
    // The one that bites: a bare `flex-col` is the stacked-at-every-width bug.
    expect(classes).not.toContain("flex-col");

    const cta = screen.getByTestId("stub-action").className.split(/\s+/);
    expect(cta).toContain("md:w-full");
    expect(cta).not.toContain("w-full");
  });

  it("makes the phone row two columns, not three, by grouping the rating with the price", () => {
    // The mockup's `.mstub` has two columns because its rating lives up in the
    // card's meta line. Ours has to carry the rating, and left as a third
    // column it did not fit: on `/providers` at 360px the "Ver negócio" button
    // sat on top of "1200 MZN", and before `min-w-0` the card grew 22px past
    // its own list and took the document sideways with it.
    //
    // So the rating and the price share one wrapper, and `md:contents`
    // dissolves it again so the desktop column is unchanged.
    const { container } = render(
      <PriceStub
        rating={{ average: 4.7, count: 6, attribution: "provider rating" }}
        eyebrow="Fixed price"
        amount="800 MZN"
        under="45 min"
        action={<a href="/x">Book</a>}
      />,
    );
    const stub = container.querySelector("[data-testid='price-stub']")!;
    // Nothing may inflate the one-column grid track the card puts this in.
    expect(stub.className.split(/\s+/)).toContain("min-w-0");

    const rating = screen.getByTestId("stub-rating");
    const price = screen.getByTestId("stub-under").closest("p")!;
    const group = rating.parentElement!;
    expect(group).toBe(price.parentElement);
    expect(group).not.toBe(stub);
    expect(group.className.split(/\s+/)).toContain("md:contents");
    // Two flex children on the phone: the price column, and the button.
    expect(group.nextElementSibling).toBe(screen.getByTestId("stub-action"));
  });

  it("keeps the caller's action clickable", () => {
    // The stub sits inside a card whose title link covers the whole surface;
    // the CTA has to sit above it or it is decoration.
    render(<PriceStub eyebrow="Fixed price" amount="800 MZN" action={<a href="/svc/1">Book</a>} />);
    expect(screen.getByRole("link", { name: "Book" })).toHaveAttribute("href", "/svc/1");
  });
});
