import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { HowItWorks } from "../how-it-works";

describe("HowItWorks", () => {
  it("names the three steps in the order they happen", () => {
    render(<HowItWorks />);
    const steps = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(steps).toEqual(["Find", "Book", "Done"]);
  });

  it("numbers them, because the order is the information", () => {
    render(<HowItWorks />);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  // The section exists to show the promise being kept, so the three facts it
  // draws are the price, the payment and the verified business the platform
  // confirms the booking with. A screen that stops showing one of them is
  // the section failing at its job — and one that started promising a street
  // address or a phone number would be promising a feature the platform does
  // not have.
  it("shows a price, the M-Pesa payment and the verified business — not an address or phone number", () => {
    render(<HowItWorks />);
    expect(screen.getByText("Pay with M-Pesa")).toBeInTheDocument();
    expect(screen.getByText("Booking confirmed")).toBeInTheDocument();
    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(screen.getAllByText(/800/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Julius Nyerere/)).toBeNull();
    expect(screen.queryByText("+258 84 123 4567")).toBeNull();
  });

  it("asks for a rating rather than showing one already given", () => {
    render(<HowItWorks />);
    expect(screen.getByText("How did it go?")).toBeInTheDocument();
    // Five stars in the muted border token, not the warning (gold) token a
    // filled rating uses elsewhere on the page. Counting the stars alone
    // would not catch them being accidentally filled in — the regression
    // this section exists to guard against.
    const stars = Array.from(screen.getByTestId("rating-ask").querySelectorAll("svg"));
    expect(stars).toHaveLength(5);
    for (const star of stars) {
      const classes = star.getAttribute("class") ?? "";
      expect(classes).toContain("fill-[var(--color-border)]");
      expect(classes).not.toContain("color-warning");
    }
  });
});
