import { useTranslation } from "react-i18next";
import { Link, useRouterState } from "@tanstack/react-router";
import { useHelpCenter } from "@/features/help-center/viewmodel/use-help-center";
import { CONTACT } from "@/shared/lib/contact";

/**
 * The "way in" a signed-out reader gets instead of a form, everywhere the
 * panel would otherwise ask them to write to support: the home screen's
 * default view, and the "new request" screen when someone reaches it (a
 * popular question, a no-match search, "send a message") without an
 * account. One copy, so a page that shows it never drifts from another that
 * does — see `help-center.tsx`'s own doc comment on the "new" screen for why
 * this is gated centrally rather than per button.
 *
 * The link does two things beyond navigating, and both are about where the
 * reader was standing. `next` is the page they asked for help on, so signing
 * in returns them to it rather than dropping them on `/` — the same
 * `search={{ next: pathname }}` the contact form and the invite acceptance
 * page pass. And it closes the panel: the route changes underneath a
 * `role="dialog"` with `aria-modal="true"` and a focus trap, so without this
 * the sign-in form rendered behind a backdrop that swallowed every click and
 * a trap that refused every Tab, with Escape the only way out.
 */
export function HelpSignInPrompt() {
  const { t } = useTranslation("help");
  const help = useHelpCenter();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <div className="grid gap-2 rounded-[var(--radius-card)] border border-[var(--color-border)] p-4">
      <p className="type-body-medium">{t("signedOutTitle")}</p>
      <p className="type-caption text-[var(--color-muted-foreground)]">
        {t("signedOutBody", { email: CONTACT.support })}
      </p>
      <Link
        to="/sign-in"
        search={{ next: pathname }}
        onClick={() => help.close()}
        className="type-body-medium text-[var(--color-primary)] hover:underline"
      >
        {t("signIn")}
      </Link>
    </div>
  );
}
