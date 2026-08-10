import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { LOCALES } from "@ntizo/shared";
import { Label } from "@ntizo/frontend-ui";
import { useCurrentUser } from "@/features/user/viewmodel/use-current-user";
import { useUpdateMyProfile } from "@/features/account/viewmodel/use-update-profile";

const NAMES: Record<string, string> = {
  "en-US": "English",
  "pt-MZ": "Português (Moçambique)",
  "pt-PT": "Português (Portugal)",
  "es-ES": "Español",
  "de-DE": "Deutsch",
  "fr-FR": "Français",
  "it-IT": "Italiano",
  "nl-NL": "Nederlands",
};

/**
 * The saved language, as opposed to the one the header switches.
 *
 * Those are two different things and the difference matters: the header picks
 * the language of this browser, kept in localStorage; this one is stored on
 * the profile and is what a notification email will be written in. Changing
 * it here changes both — leaving the page in one language while promising
 * emails in another would be a puzzle nobody should have to solve.
 */
export function LanguagePreference() {
  const { t, i18n } = useTranslation("account");
  const { data: user } = useCurrentUser();
  const update = useUpdateMyProfile();

  async function choose(locale: string) {
    try {
      await update.mutateAsync({ language: locale as (typeof LOCALES)[number] });
      void i18n.changeLanguage(locale);
      toast.success(t("saved"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("saveFailed"));
    }
  }

  return (
    <div className="grid gap-1.5">
      <Label htmlFor="language">{t("fieldLanguages")}</Label>
      <p className="type-caption mb-1 text-[var(--color-muted-foreground)]">
        {t("languageBlurb")}
      </p>
      <select
        id="language"
        value={user?.language ?? "en-US"}
        disabled={update.isPending}
        onChange={(e) => void choose(e.target.value)}
        className="type-body h-11 max-w-sm rounded-[var(--radius-field)] border border-[var(--color-input)] bg-[var(--color-background)] px-3 focus-visible:border-[var(--color-primary)] focus-visible:outline-none disabled:opacity-60"
      >
        {LOCALES.map((locale) => (
          <option key={locale} value={locale}>
            {NAMES[locale] ?? locale}
          </option>
        ))}
      </select>
    </div>
  );
}
