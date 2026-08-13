import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Search, Wallet } from "lucide-react";
import { EmptyCard } from "./empty-card";

/**
 * The mark is the one thing every empty screen shares, so what these assert is
 * mostly *when it is absent*. A brand mark over "nothing matches your filter"
 * claims the account is empty when it is not, and nothing about that failure is
 * visible from the type checker.
 */

/** The gradient is unique to `BrandMark` — no other element on the card has one. */
const brandMark = (container: HTMLElement) =>
  container.querySelector("linearGradient");

describe("EmptyCard", () => {
  it("draws the brand mark by default", () => {
    const { container } = render(<EmptyCard title="No bookings yet" />);
    expect(brandMark(container)).toBeTruthy();
  });

  it("shows the title and the body", () => {
    render(<EmptyCard title="No bookings yet" body="They will show up here." />);
    expect(screen.getByText("No bookings yet")).toBeTruthy();
    expect(screen.getByText("They will show up here.")).toBeTruthy();
  });

  it("omits the body paragraph when there is no body", () => {
    // Rather than rendering an empty <p>, which still takes its line height and
    // pushes the action away from the title by a line nobody asked for.
    const { container } = render(<EmptyCard title="No bookings yet" />);
    expect(container.querySelectorAll("p")).toHaveLength(0);
  });

  it("badges the mark without replacing it", () => {
    const { container } = render(<EmptyCard title="No activity yet" badge={Wallet} />);
    expect(brandMark(container)).toBeTruthy();
    // The mark plus the badge glyph.
    expect(container.querySelectorAll("svg").length).toBe(2);
  });

  it("drops the brand mark entirely when given an icon", () => {
    // The filter case: the rows exist and something is hiding them, so the
    // brand would be announcing an empty account that is not empty.
    const { container } = render(<EmptyCard title="No matches" icon={Search} />);
    expect(brandMark(container)).toBeNull();
    expect(container.querySelectorAll("svg")).toHaveLength(1);
  });

  it("ignores a badge when the mark it would sit on is not drawn", () => {
    const { container } = render(
      <EmptyCard title="No matches" icon={Search} badge={Wallet} />,
    );
    expect(container.querySelectorAll("svg")).toHaveLength(1);
  });

  it("renders the action when there is somewhere to go", () => {
    render(
      <EmptyCard
        title="No bookings yet"
        action={<button type="button">Browse providers</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Browse providers" })).toBeTruthy();
  });

  it("gives two marks on one page their own gradient ids", () => {
    // A gradient is referenced by fragment id. Two cards sharing one id means
    // the second silently paints with the first's definition — or with nothing,
    // if the first has unmounted.
    const { container } = render(
      <>
        <EmptyCard title="One" />
        <EmptyCard title="Two" />
      </>,
    );
    const ids = [...container.querySelectorAll("linearGradient")].map((g) => g.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});
