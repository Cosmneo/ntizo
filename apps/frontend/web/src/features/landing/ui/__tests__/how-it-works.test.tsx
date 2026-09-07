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
  // the section failing at its job.
  it("shows a price, the M-Pesa payment and the verified business", () => {
    render(<HowItWorks />);
    expect(screen.getByText("Send request")).toBeInTheDocument();
    expect(screen.getByText("Booking confirmed")).toBeInTheDocument();
    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(screen.getAllByText(/800/).length).toBeGreaterThan(0);
    expect(screen.getByText("Paid 800 MZN with M-Pesa")).toBeInTheDocument();
  });

  // Checking for the two exact strings this section used to print
  // ("+258 84 123 4567", "Julius Nyerere") only proves those particular words
  // are gone — it says nothing about a differently-worded address or phone
  // number sneaking back in. This checks the shape instead, against the
  // section's whole rendered text, so it would catch a reveal however it is
  // punctuated or phrased.
  it("never prints anything shaped like a phone number or a street address", () => {
    render(<HowItWorks />);
    const text = document.body.textContent ?? "";
    // A phone number, however it is grouped, is a run of ten or more digits
    // with only spaces or dashes between them (an optional leading "+" for a
    // country code). Nothing legitimate on these screens is that long a run:
    // the longest genuine digit sequence is a four-digit price ("1 100 MZN")
    // or a reference code ("NTZ-4821", which starts with letters, not a
    // digit).
    expect(text).not.toMatch(/\+?\d[\d\s-]{8,}\d/);
    // A Mozambican street address names the road with one of a handful of
    // words — Avenida/Av., Rua, Travessa — before the name itself. Nothing a
    // confirmed booking gives the customer needs one.
    //
    // Not `\b`: adjacent elements on these screens routinely abut in
    // `textContent` with no space between them (a time and the field after
    // it, a photo's alt text and a name), and `\b` treats a digit as a word
    // character exactly like a letter — so "...14:00Rua..." has no boundary
    // between "0" and "R" and `\bRua\b` would silently never fire right where
    // it matters most. These lookarounds only ask that a *letter* not sit on
    // either side, which still refuses to match "Rua" buried inside a longer
    // word like "estrutura".
    expect(text).not.toMatch(
      /(?<![A-Za-zÀ-ÖØ-öø-ÿ])(Av\.|Avenida|Rua|Travessa)(?![A-Za-zÀ-ÖØ-öø-ÿ])/i,
    );
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
