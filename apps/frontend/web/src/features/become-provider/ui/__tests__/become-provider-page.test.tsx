import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { BecomeProviderPage } from "../become-provider-page";
import { renderCompanyPage } from "@/features/company/ui/__tests__/render-company-page";

/**
 * The provider pitch, drawn on the home page's rules.
 *
 * `renderCompanyPage` despite the name: it is the generic public-page harness
 * — a router that knows every route the header and footer link to, an unseeded
 * `QueryClient` so the session reads as signed out, and a `HelpCenterProvider`
 * for the footer's support link. This page needs exactly that.
 *
 * jsdom does no layout and computes no custom properties, so none of what this
 * change was about is measurable here. What *is* assertable is the thing that
 * would silently undo it: the classes and tokens. Every case below names a
 * specific piece of the old page that must not come back.
 */
const render = () => renderCompanyPage(BecomeProviderPage, "/become-provider");

/** Everything the page draws, header and footer included. */
const page = () => document.body;

describe("BecomeProviderPage", () => {
  it("keeps every section, and ends on the ask", async () => {
    await render();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Offer your services. You set the price.",
    );
    for (const heading of [
      "Two ways to provide",
      "One price, set by you",
      "How it works",
      "What you need",
      "Ready to start earning?",
    ]) {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    }
  });

  /**
   * The headline was `{title} <span style="color: ACCENT">{titleAccent}</span>`
   * — half a sentence in blue, which is the tell the listings and the home
   * both removed. Both halves stay; the colouring does not.
   */
  it("says the whole headline in one colour", async () => {
    await render();
    const h1 = screen.getByRole("heading", { level: 1 });

    expect(h1.className).toContain("text-[var(--color-headline)]");
    expect(h1.querySelector("[style*='color']")).toBeNull();
  });

  /**
   * The site spends `--color-primary` on search and sign-in. The header brings
   * a search bar to every public page now, so anything blue this page drew
   * itself would be the second blue on one screen.
   */
  it("draws no blue of its own — every one on screen belongs to the header", async () => {
    await render();

    const blue = [...page().querySelectorAll<HTMLElement>("[class*='--color-primary']")];
    // Two, and both the header's: the search submit and the sign-in pill.
    // Neither is this page's to spend.
    expect(blue.length).toBeGreaterThan(0);
    for (const el of blue) expect(el.closest("header")).not.toBeNull();
  });

  /**
   * `LANDING_VARS` and `PAGE_TOP` painted this page with inline styles, which
   * is why it stayed light on a dark screen and why its navy was a different
   * navy from the home's. Every colour is a token now, so no element may carry
   * a hard-coded background.
   */
  it("paints nothing with an inline colour", async () => {
    await render();

    // The page's own sections only. `Footer` is still painted with literals
    // from `palette.ts` — 22 elements of it — and migrating that file is its
    // own job; this asserts the page stopped, not that the site has.
    const painted = [
      ...document.querySelectorAll<HTMLElement>("main > section[style], main > section [style]"),
    ].filter((el) => /background|(^|[^-])color\s*:/.test(el.getAttribute("style") ?? ""));
    expect(painted).toHaveLength(0);
  });

  /**
   * Numbers promise an order. The two paths are a choice between two things,
   * so they carry none; the four steps are a sequence you cannot reorder —
   * you are not published before you are verified — so they do.
   */
  it("numbers the steps and refuses to number the paths", async () => {
    await render();

    const paths = screen.getByRole("heading", { name: "Two ways to provide" }).closest("section")!;
    // Any digit at all, because none of this section's copy carries one — so a
    // digit here can only be a marker. `/\b0?[12]\b/` was the first attempt
    // and it never fired: `textContent` concatenates without separators, so
    // the string reads "01Por conta própria" and there is no word boundary
    // between the "1" and the "P" for `\b` to match.
    expect(paths.textContent).not.toMatch(/\d/);

    const steps = screen.getByRole("heading", { name: "How it works" }).closest("section")!;
    expect(within(steps).getAllByRole("listitem")).toHaveLength(4);
    for (const n of ["1", "2", "3", "4"]) {
      expect(within(steps).getByText(n)).toBeInTheDocument();
    }
  });

  /**
   * The band is the page's one dark surface and its tokens are load-bearing.
   * `--color-headline` goes near-white in dark mode, so a literal white button
   * carrying it disappears — a bug this page's predecessor shipped once.
   */
  it("puts the closing button on the dark-aware pair, not literal white", async () => {
    await render();

    const band = screen.getByRole("heading", { name: "Ready to start earning?" }).closest("section")!;
    expect(band.className).toContain("bg-[var(--color-navy-surface)]");

    const button = within(band).getByRole("link", { name: "Get started" });
    expect(button.className).toContain("bg-[var(--color-navy-on)]");
    expect(button.className).toContain("text-[var(--color-navy-surface)]");
    expect(button.className).not.toContain("--color-headline");
  });

  /**
   * Signed out, the button goes through registration carrying the intent. A
   * query string inside `to` would be read as part of the path and match no
   * route, which is how this chain used to break at "registered, landed on the
   * customer home, and the thing they came for was never offered again".
   */
  it("carries the intent through registration when nobody is signed in", async () => {
    await render();

    for (const link of screen.getAllByRole("link", { name: "Get started" })) {
      expect(link).toHaveAttribute("href", "/sign-up?next=%2Fonboarding");
    }
  });
});
