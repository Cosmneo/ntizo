import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { CONTACT } from "@/shared/lib/contact";

/**
 * The "way in" a signed-out reader gets instead of a form, everywhere the
 * panel would otherwise ask them to write to support: the home screen's
 * default view, and the "new request" screen when someone reaches it (a
 * popular question, a no-match search, "send a message") without an
 * account. One copy, so a page that shows it never drifts from another that
 * does — see `help-center.tsx`'s own doc comment on the "new" screen for why
 * this is gated centrally rather than per button.
 */
export function HelpSignInPrompt() {
  const { t } = useTranslation("help");
  return (
    <div className="grid gap-2 rounded-[var(--radius-card)] border border-[var(--color-border)] p-4">
      <p className="type-body-medium">{t("signedOutTitle")}</p>
      <p className="type-caption text-[var(--color-muted-foreground)]">
        {t("signedOutBody", { email: CONTACT.support })}
      </p>
      <Link to="/sign-in" className="type-body-medium text-[var(--color-primary)] hover:underline">
        {t("signIn")}
      </Link>
    </div>
  );
}
