import { useTranslation } from "react-i18next";
import { MessageSquarePlus, Inbox, Search } from "lucide-react";
import { POPULAR_QUESTION_IDS } from "@/features/help-center/domain/faq";
import { useFaqEntries, HelpFaq } from "@/features/help-center/ui/help-faq";
import { useHelpCenter } from "@/features/help-center/viewmodel/use-help-center";
import { HelpSignInPrompt } from "@/features/help-center/ui/help-sign-in-prompt";

/**
 * What the panel opens on.
 *
 * The FAQ is above the fold for everyone, signed in or not — most people
 * arrive with a question, not a case. Typing in the box replaces the rest of
 * this screen with the results, rather than navigating: a search that costs
 * a screen transition discourages the second query.
 */
export function HelpHome({ signedIn, unreadCount }: { signedIn: boolean; unreadCount: number }) {
  const { t } = useTranslation("help");
  const help = useHelpCenter();
  const entries = useFaqEntries();
  const popular = POPULAR_QUESTION_IDS.map((id) => entries.find((entry) => entry.id === id)).filter(
    (entry): entry is NonNullable<typeof entry> => entry !== undefined,
  );

  return (
    <div className="grid gap-4 p-4">
      <label className="relative block">
        <span className="sr-only">{t("searchLabel")}</span>
        <Search aria-hidden="true" className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
        <input
          type="search"
          value={help.query}
          onChange={(event) => help.setQuery(event.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchLabel")}
          className="type-body w-full rounded-[var(--radius-field)] border border-[var(--color-input)] bg-[var(--color-background)] py-2.5 pr-3.5 pl-9 placeholder:text-[var(--color-muted-foreground)] focus-visible:border-[var(--color-primary)] focus-visible:outline-none"
        />
      </label>

      {help.query.trim() ? (
        <HelpFaq query={help.query} onAskUs={() => help.composeNew()} />
      ) : (
        <>
          {signedIn ? (
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => help.composeNew()} className={CARD}>
                <MessageSquarePlus aria-hidden="true" className="h-5 w-5 text-[var(--color-primary)]" />
                <span className="type-body-medium">{t("actionMessage")}</span>
                <span className="type-caption text-[var(--color-muted-foreground)]">{t("actionMessageBody")}</span>
              </button>
              <button type="button" onClick={() => help.go("requests")} className={CARD}>
                <span className="flex items-center gap-2">
                  <Inbox aria-hidden="true" className="h-5 w-5 text-[var(--color-primary)]" />
                  {unreadCount > 0 && (
                    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--color-primary)] px-1 text-[11px] font-semibold text-[var(--color-primary-foreground)]">
                      {unreadCount}
                    </span>
                  )}
                </span>
                <span className="type-body-medium">{t("actionRequests")}</span>
                <span className="type-caption text-[var(--color-muted-foreground)]">{t("actionRequestsBody")}</span>
              </button>
            </div>
          ) : (
            <HelpSignInPrompt />
          )}

          <section className="grid gap-2">
            <h3 className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
              {t("popularTitle")}
            </h3>
            <ul className="grid list-none gap-1.5 p-0">
              {popular.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => {
                      help.setQuery(entry.question);
                      help.go("faq");
                    }}
                    className="type-body w-full rounded-[var(--radius-card)] border border-[var(--color-border)] px-3.5 py-2.5 text-left hover:bg-[var(--color-muted)]"
                  >
                    {entry.question}
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => help.go("faq")} className="type-body-medium text-[var(--color-primary)] hover:underline">
              {t("browseAll")}
            </button>
          </section>
        </>
      )}
    </div>
  );
}

const CARD =
  "grid gap-1 rounded-[var(--radius-card)] border border-[var(--color-border)] p-3.5 text-left hover:bg-[var(--color-muted)]";
