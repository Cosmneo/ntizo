import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { AboutPage } from "../about-page";
import { CareersPage } from "../careers-page";
import { renderCompanyPage } from "./render-company-page";

/** The strip's links, as hrefs, in order. */
function stripHrefs() {
  const strip = screen.getByRole("heading", { name: /see also/i }).parentElement!;
  return Array.from(strip.querySelectorAll("a")).map((a) => a.getAttribute("href"));
}

describe("AboutPage", () => {
  it("leads with the title, the mission, the three steps and the four principles", async () => {
    await renderCompanyPage(AboutPage, "/about");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Local services you can trust.");
    expect(screen.getByText("Make hiring a service as simple and as safe as buying in a shop.")).toBeInTheDocument();
    for (const step of ["Search and compare", "Book the time", "Pay after confirmation"]) {
      expect(screen.getByRole("heading", { name: step })).toBeInTheDocument();
    }
    for (const rule of ["The price is the price.", "Verification before visibility.", "Pay only after the yes.", "Built for here, ready to grow."]) {
      expect(screen.getByRole("heading", { name: rule })).toBeInTheDocument();
    }
  });

  it("sends customers to services and providers to the pitch", async () => {
    await renderCompanyPage(AboutPage, "/about");
    // Scoped to each audience card: the footer also links to /become-provider,
    // so an unscoped `getByRole("link", { name: /become a provider/i })` is
    // ambiguous — both the footer's own link and this page's card match.
    const customers = screen.getByRole("heading", { name: "Find, book and pay in one place." }).closest("article")!;
    expect(within(customers).getByRole("link", { name: /explore services/i })).toHaveAttribute("href", "/services");
    const providers = screen.getByRole("heading", { name: "Your calendar, your prices, your customers." }).closest("article")!;
    expect(within(providers).getByRole("link", { name: /become a provider/i })).toHaveAttribute("href", "/become-provider");
  });

  it("offers contact, feedback and careers at the bottom — and not itself", async () => {
    await renderCompanyPage(AboutPage, "/about");
    expect(stripHrefs()).toEqual(["/contact", "/feedback?from=%2Fabout", "/careers"]);
  });

  it("draws no accent rule beside its eyebrows", async () => {
    await renderCompanyPage(AboutPage, "/about");
    // The owner's rule: no hairline flourish before uppercase labels.
    expect(document.querySelector(".h-px.w-8")).toBeNull();
  });
});

describe("CareersPage", () => {
  it("says there are no open roles and opens the mail client with the subject filled in", async () => {
    await renderCompanyPage(CareersPage, "/careers");
    expect(screen.getByRole("heading", { name: "None right now." })).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /spontaneous application/i });
    expect(cta).toHaveAttribute("href", "mailto:ola@ntizo.co.mz?subject=Spontaneous%20application");
  });

  it("lists the three ways of working", async () => {
    await renderCompanyPage(CareersPage, "/careers");
    for (const h of ["We write before we build.", "We ship early and fix fast.", "Whoever uses it comes first."]) {
      expect(screen.getByRole("heading", { name: h })).toBeInTheDocument();
    }
  });

  it("offers contact, feedback and about at the bottom", async () => {
    await renderCompanyPage(CareersPage, "/careers");
    expect(stripHrefs()).toEqual(["/contact", "/feedback?from=%2Fcareers", "/about"]);
  });
});
