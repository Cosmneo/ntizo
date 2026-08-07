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

export function buttonHtml(url: string, label: string): string {
  return `<p style="margin:24px 0;">
    <a href="${url}" style="background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;font-weight:500;">${label}</a>
  </p>`;
}
