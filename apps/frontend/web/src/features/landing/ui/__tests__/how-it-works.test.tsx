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
  // draws are the price, the payment and the contact details the platform
  // hands over. A screen that stops showing one of them is the section
  // failing at its job.
  it("shows a price, the M-Pesa payment and the revealed contact", () => {
    render(<HowItWorks />);
    expect(screen.getByText("Pay with M-Pesa")).toBeInTheDocument();
    expect(screen.getByText("Booking confirmed")).toBeInTheDocument();
    expect(screen.getByText("+258 84 123 4567")).toBeInTheDocument();
    expect(screen.getAllByText(/800/).length).toBeGreaterThan(0);
  });

  it("asks for a rating rather than showing one already given", () => {
    render(<HowItWorks />);
    expect(screen.getByText("How did it go?")).toBeInTheDocument();
    // Five empty stars, not a five-star score. A filled row beside the words
    // "how did it go?" answers its own question.
    expect(screen.getByTestId("rating-ask").querySelectorAll("svg")).toHaveLength(5);
    expect(screen.queryByTestId("rating-ask-filled")).toBeNull();
  });
});
