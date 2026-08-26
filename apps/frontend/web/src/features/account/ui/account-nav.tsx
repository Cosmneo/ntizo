import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useSignOut } from "@/features/user/viewmodel/use-sign-out";
import { accountSections } from "@/shared/lib/account-sections";

export function AccountNav() {
  const { t } = useTranslation("account");
  const sections = accountSections();
  const { t: ta } = useTranslation("auth");
  const signOut = useSignOut();

  async function handleSignOut() {
    const { serverRevokeFailed } = await signOut();
    if (serverRevokeFailed) toast.error(ta("signOutOffline"));
  }

  return (
    /* A scrolling strip on a phone, the sidebar it always was from `lg`.
       Stacked vertically, seven entries plus sign-out filled the whole
       screen: every settings page opened on a menu, with the thing you came
       to read below the fold. The strip keeps the map of the area visible —
       which was the reason for not using a drawer — without spending the
       viewport on it.

       No bleed to the screen edge: `page-shell` sizes itself with
       `width: min(1320px, 100% - 3rem)` and centres with margin, not padding,
       so a negative inline margin here does not escape a padding box — it
       escapes the viewport, and the whole page gains a horizontal scrollbar. */
    <nav
      aria-label={t("navLabel")}
      className="border-b border-[var(--color-border)] lg:rounded-[var(--radius-card)] lg:border lg:bg-[var(--color-background)] lg:p-2"
    >
      <ul className="flex list-none gap-1 overflow-x-auto p-0 pb-2 lg:grid lg:gap-0.5 lg:overflow-visible lg:pb-0">
        {sections.map((section) => (
          <li key={section.to} className="shrink-0">
            <Link
              to={section.to}
              activeOptions={{ exact: section.exact }}
              className="type-body-medium block whitespace-nowrap rounded-[var(--radius-field)] px-3.5 py-2.5 text-[var(--color-foreground)] hover:bg-[var(--color-muted)]"
              activeProps={{
                className:
                  "block whitespace-nowrap rounded-[var(--radius-field)] px-3.5 py-2.5 type-body-medium bg-[var(--color-muted)] text-[var(--color-primary)] font-semibold",
              }}
            >
              {t(section.key)}
            </Link>
          </li>
        ))}

        {/* Last, and separated only in the column: a horizontal rule between
            two chips in a strip reads as a divider between groups, not as
            "this one is different". */}
        <li className="shrink-0 lg:mt-1 lg:border-t lg:border-[var(--color-border)] lg:pt-1">
          {/* A button, not a link. Signing out is an action with a request
              behind it, and rendering it as a link invites a middle-click
              that opens a tab and leaves the session intact. */}
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="type-body-medium w-full whitespace-nowrap rounded-[var(--radius-field)] px-3.5 py-2.5 text-left text-[var(--color-destructive)] hover:bg-[color-mix(in_srgb,var(--color-destructive)_8%,transparent)]"
          >
            {t("navSignOut")}
          </button>
        </li>
      </ul>
    </nav>
  );
}
