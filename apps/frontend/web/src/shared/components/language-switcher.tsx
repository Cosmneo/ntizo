import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Globe, X } from "lucide-react";
import { Dialog, DialogContent, cn, regionalFlag } from "@ntizo/frontend-ui";
import { SUPPORTED_LOCALES } from "@/shared/lib/i18n";

/**
 * Each locale named in its own language, with the region whose flag is shown.
 *
 * Written out rather than derived from `Intl.DisplayNames`, unlike the 245
 * countries in PhoneInput. For eight fixed entries the API's output is worse
 * than a list: it returns "American English", "Português europeu" and
 * "Español de España" — accurate, but not what a language picker shows.
 */
const LOCALES: Record<string, { name: string; region: string }> = {
  "en-US": { name: "English", region: "US" },
  "pt-MZ": { name: "Português (Moçambique)", region: "MZ" },
  "pt-PT": { name: "Português (Portugal)", region: "PT" },
  "es-ES": { name: "Español", region: "ES" },
  "de-DE": { name: "Deutsch", region: "DE" },
  "fr-FR": { name: "Français", region: "FR" },
  "it-IT": { name: "Italiano", region: "IT" },
  "nl-NL": { name: "Nederlands", region: "NL" },
};

/**
 * The picker itself, controlled from outside.
 *
 * Separate from the trigger because two places open it: the header button on
 * desktop and the bottom bar on phones. Bundling the trigger in would have
 * meant a second copy of the dialog, and two ways for the two to drift.
 */
export function LanguageDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t, i18n } = useTranslation("common");

  // `resolvedLanguage`, not `language`: after a fallback (a browser sending
  // bare "pt") `language` still holds the requested tag, which matches none of
  // our locales and would leave every row unticked.
  const active = i18n.resolvedLanguage ?? i18n.language;

  function choose(locale: string) {
    // Persisted for us: the detector caches to localStorage ("i18nextLng") by
    // default, so the choice survives a reload and outranks the browser's own
    // Accept-Language on the next visit.
    void i18n.changeLanguage(locale);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <div className="mb-6 flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-secondary)]">
            <Globe className="h-5 w-5 text-[var(--color-primary)]" />
          </span>
          <h2 className="flex-1 pt-1.5 text-xl font-semibold">{t("language")}</h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label={t("close")}
            className="rounded-md p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* The mockup pairs this with a Currency tab. Left out on purpose:
            nothing in the product carries a price yet, so a currency choice
            would change nothing a user could see. */}
        <div className="grid gap-1 sm:grid-cols-2">
          {SUPPORTED_LOCALES.map((locale) => {
            const meta = LOCALES[locale];
            const selected = locale === active;
            return (
              <button
                key={locale}
                type="button"
                onClick={() => choose(locale)}
                aria-current={selected}
                className={cn(
                  "flex items-center gap-3 rounded-full px-3 py-2 text-left text-sm",
                  selected
                    ? "bg-[var(--color-secondary)] font-medium text-[var(--color-primary)]"
                    : "hover:bg-[var(--color-muted)]",
                )}
              >
                <span aria-hidden="true" className="text-base">
                  {regionalFlag(meta?.region ?? "UN")}
                </span>
                <span className="flex-1 truncate">{meta?.name ?? locale}</span>
                {selected ? <Check className="h-4 w-4 shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Header button plus the dialog it opens. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { t, i18n } = useTranslation("common");
  const [open, setOpen] = useState(false);

  const active = i18n.resolvedLanguage ?? i18n.language;
  const short = (active.split("-")[0] ?? "en").toUpperCase();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("changeLanguage")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm",
          "text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]",
          className,
        )}
      >
        <Globe className="h-4 w-4" />
        <span>{short}</span>
      </button>
      <LanguageDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
