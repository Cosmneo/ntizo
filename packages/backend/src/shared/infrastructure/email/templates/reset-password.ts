import { buttonHtml, emailLayout } from "./layout";

export function resetPasswordTemplate(url: string): {
  subject: string;
  html: string;
  text: string;
} {
  return {
    subject: "Reset your password",
    html: emailLayout({
      heading: "Reset your password",
      bodyHtml: `<p style="font-size:14px;color:#333;line-height:1.5;">
        We received a request to reset your Ntizo password. Click the button below to choose a new one. This link expires in 1 hour.
      </p>${buttonHtml(url, "Reset password")}
      <p style="font-size:12px;color:#888;">Or copy and paste this link into your browser:<br/><a href="${url}">${url}</a></p>`,
      disclaimer: "If you didn't request a password reset, you can safely ignore this email.",
    }),
    text: `Reset your password: ${url}`,
  };
}
