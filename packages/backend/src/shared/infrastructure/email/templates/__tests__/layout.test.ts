import { describe, expect, it } from "bun:test";
import { buttonHtml, emailLayout } from "../layout";

const PRIMARY = "#006ffd";

describe("buttonHtml", () => {
  it("wears the app's primary colour, not a near-black", () => {
    // It shipped as #111 and looked like a system dialog next to an app whose
    // whole identity is this blue.
    const html = buttonHtml("https://ntizo.co.mz/x", "Explore Ntizo");
    expect(html).toContain(PRIMARY);
    expect(html).not.toContain("#111");
  });

  it("colours a table cell rather than the link itself", () => {
    // Outlook drops `background` from an <a> and the button arrives as blue
    // underlined text on white. bgcolor on the <td> survives — the same
    // technique provider-invite.template.ts uses, and for the same reason.
    const html = buttonHtml("https://ntizo.co.mz/x", "Explore Ntizo");
    expect(html).toContain(`bgcolor="${PRIMARY}"`);
    expect(html).not.toMatch(/<a[^>]*background:/);
  });

  it("keeps the label and the destination", () => {
    const html = buttonHtml("https://ntizo.co.mz/welcome", "Explorar");
    expect(html).toContain('href="https://ntizo.co.mz/welcome"');
    expect(html).toContain("Explorar");
  });
});

describe("emailLayout", () => {
  it("renders the heading, the body and a disclaimer", () => {
    const html = emailLayout({ heading: "Bem-vindo", bodyHtml: "<p>Olá</p>" });
    expect(html).toContain("Bem-vindo");
    expect(html).toContain("<p>Olá</p>");
    expect(html).toContain("ignore");
  });
});
