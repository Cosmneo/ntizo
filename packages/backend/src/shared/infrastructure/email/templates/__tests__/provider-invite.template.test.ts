import { describe, expect, it } from "bun:test";
import { buildProviderInviteEmail } from "../provider-invite.template";

const base = {
  providerName: "Salão Beleza",
  inviterName: "Pedro",
  role: "admin",
  acceptUrl: "https://ntizo.com/accept-invite/abc123",
  expiresInDays: 7,
};

describe("provider invite email", () => {
  it("carries the accept link, which is the whole point", () => {
    // The version this replaces printed a 48-character hex token into a
    // paragraph and nothing else: somewhere to look, nowhere to click.
    const mail = buildProviderInviteEmail(base);
    expect(mail.html).toContain(`href="${base.acceptUrl}"`);
    expect(mail.text).toContain(base.acceptUrl);
  });

  it("spells the URL out as well as linking it", () => {
    // A share of recipients read plain text, and a button whose destination is
    // invisible is the shape every phishing email has.
    const mail = buildProviderInviteEmail(base);
    const occurrences = mail.html.split(base.acceptUrl).length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it("writes in the inviter's language", () => {
    const pt = buildProviderInviteEmail({ ...base, locale: "pt-PT" });
    expect(pt.subject).toContain("convidou");
    expect(pt.html).toContain("Aceitar o convite");
  });

  it("treats Mozambican Portuguese as Portuguese rather than English", () => {
    const mz = buildProviderInviteEmail({ ...base, locale: "pt-MZ" });
    expect(mz.html).toContain("Aceitar o convite");
  });

  it("falls back to English for a language it does not have", () => {
    // A wrong language beats a blank email.
    const mail = buildProviderInviteEmail({ ...base, locale: "sw-KE" });
    expect(mail.html).toContain("Accept the invitation");
  });

  it("names the role in the reader's language, not the enum", () => {
    const pt = buildProviderInviteEmail({ ...base, locale: "pt-PT" });
    expect(pt.html).toContain("administrador");
    expect(pt.html).not.toContain(">admin<");
  });

  it("escapes the workspace name", () => {
    // Typed by whoever created the business, rendered by a mail client. A
    // business called `<script>` must not become markup somebody else wrote.
    const mail = buildProviderInviteEmail({
      ...base,
      providerName: '<script>alert(1)</script>',
    });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });

  it("escapes the accept URL before putting it in an attribute", () => {
    const mail = buildProviderInviteEmail({
      ...base,
      acceptUrl: 'https://x.test/"onmouseover="alert(1)',
    });
    expect(mail.html).not.toContain('"onmouseover="');
  });

  it("says how long the link lasts, because it does", () => {
    expect(buildProviderInviteEmail(base).html).toContain("7");
  });

  it("uses tables and inline styles, not a stylesheet", () => {
    // Outlook renders with Word's engine. A <style> block and flexbox both
    // arrive as an unstyled wall of text there.
    const mail = buildProviderInviteEmail(base);
    expect(mail.html).toContain('role="presentation"');
    expect(mail.html).not.toContain("<style");
    expect(mail.html).not.toContain("display:flex");
  });

  it("embeds no image", () => {
    // Every major client blocks remote images by default; an <img> wordmark
    // arrives as an empty box for a large share of recipients.
    expect(buildProviderInviteEmail(base).html).not.toContain("<img");
  });
});
