import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useSignOut } from "@/features/user/viewmodel/use-sign-out";

/**
 * The account sections, in the order they are used rather than alphabetically:
 * the profile first, then the things attached to it, then the settings, then
 * the legal text nobody opens twice.
 *
 * Documents are deliberately absent. Only a provider submits any, and a
 * provider's documents belong to their workspace, not to the person's account.
 */
const SECTIONS = [
  { to: "/account", key: "navProfile", exact: true },
  { to: "/account/addresses", key: "navAddresses", exact: false },
  { to: "/account/payment-methods", key: "navPaymentMethods", exact: false },
  { to: "/account/security", key: "navSecurity", exact: false },
  { to: "/account/preferences", key: "navPreferences", exact: false },
  { to: "/account/notifications", key: "navNotifications", exact: false },
  { to: "/account/legal", key: "navLegal", exact: false },
] as const;

export function AccountNav() {
  const { t } = useTranslation("account");
  const { t: ta } = useTranslation("auth");
  const signOut = useSignOut();

  async function handleSignOut() {
    const { serverRevokeFailed } = await signOut();
    if (serverRevokeFailed) toast.error(ta("signOutOffline"));
  }

  return (
    <nav
      aria-label={t("navLabel")}
      className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-background)] p-2"
    >
      <ul className="grid list-none gap-0.5 p-0">
        {SECTIONS.map((section) => (
          <li key={section.to}>
            <Link
              to={section.to}
              activeOptions={{ exact: section.exact }}
              className="type-body-medium block rounded-[var(--radius-field)] px-3.5 py-2.5 text-[var(--color-foreground)] hover:bg-[var(--color-muted)]"
              activeProps={{
                className:
                  "block rounded-[var(--radius-field)] px-3.5 py-2.5 type-body-medium bg-[var(--color-muted)] text-[var(--color-primary)] font-semibold",
              }}
            >
              {t(section.key)}
            </Link>
          </li>
        ))}

        <li className="mt-1 border-t border-[var(--color-border)] pt-1">
          {/* A button, not a link. Signing out is an action with a request
              behind it, and rendering it as a link invites a middle-click
              that opens a tab and leaves the session intact. */}
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="type-body-medium w-full rounded-[var(--radius-field)] px-3.5 py-2.5 text-left text-[var(--color-destructive)] hover:bg-[color-mix(in_srgb,var(--color-destructive)_8%,transparent)]"
          >
            {t("navSignOut")}
          </button>
        </li>
      </ul>
    </nav>
  );
}
