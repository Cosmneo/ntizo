import { buttonHtml, emailLayout } from "./layout";

export function verifyEmailTemplate(url: string): {
  subject: string;
  html: string;
  text: string;
} {
  return {
    subject: "Verify your email",
    html: emailLayout({
      heading: "Verify your email",
      bodyHtml: `<p style="font-size:14px;color:#333;line-height:1.5;">
        Click the button below to verify your email address and activate your Ntizo account.
      </p>${buttonHtml(url, "Verify email")}
      <p style="font-size:12px;color:#888;">Or copy and paste this link into your browser:<br/><a href="${url}">${url}</a></p>`,
      disclaimer: "If you didn't create an account, you can safely ignore this email.",
    }),
    text: `Verify your email: ${url}`,
  };
}
