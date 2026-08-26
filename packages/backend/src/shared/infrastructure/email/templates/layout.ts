/**
 * The app's primary, as an inline literal.
 *
 * Email cannot read a CSS custom property: Gmail strips `<style>` and every
 * `var()` with it, so a token here would render as no colour at all and the
 * link would fall back to browser blue. It is duplicated from
 * `--color-primary` / `--color-brand-accent` in the web app's stylesheet, and
 * from ACCENT in provider-invite.template.ts, which arrived at the same value
 * for the same reason.
 */
const PRIMARY = "#006ffd";

export function emailLayout(opts: {
  heading: string;
  bodyHtml: string;
  disclaimer?: string;
}): string {
  const disclaimer =
    opts.disclaimer ??
    "If you weren't expecting this email, you can safely ignore it.";
  return `<!doctype html>
<html>
  <body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:#f6f6f6;margin:0;padding:24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      <tr><td>
        <h1 style="font-size:20px;font-weight:600;color:#111;margin:0 0 16px;">${opts.heading}</h1>
        ${opts.bodyHtml}
        <hr style="border:none;border-top:1px solid #eee;margin:32px 0 16px;" />
        <p style="font-size:12px;color:#888;margin:0;">${disclaimer}</p>
      </td></tr>
    </table>
  </body>
</html>`;
}

/**
 * A button, drawn as a table cell rather than a styled link.
 *
 * `bgcolor` on the `<td>`, not `background` on the `<a>`: Outlook drops the
 * latter and the button arrives as blue underlined text on white — the same
 * reason provider-invite.template.ts is built this way, where the note above
 * its own button says so.
 */
export function buttonHtml(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
    <tr>
      <td align="center" bgcolor="${PRIMARY}" style="border-radius:8px;">
        <a href="${url}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-weight:600;border-radius:8px;">${label}</a>
      </td>
    </tr>
  </table>`;
}
