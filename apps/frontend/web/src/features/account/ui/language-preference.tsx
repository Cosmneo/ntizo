import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { LOCALES } from "@ntizo/shared";
import { Select } from "@ntizo/frontend-ui";
import { useCurrentUser } from "@/features/user/viewmodel/use-current-user";
import { useUpdateMyProfile } from "@/features/account/viewmodel/use-update-profile";
import {
  applyThemePreference,
  readThemePreference,
  type ThemePreference,
} from "@/shared/lib/theme";
import { Setting } from "@/features/account/ui/setting";

/**
 * Each language in its own words.
 *
 * Not translated, on purpose: someone looking for Deutsch is looking for the
 * word "Deutsch". Naming it "Alemão" helps only the people who already read
 * the language the page is currently in — which is exactly the people not
 * using this control.
 */
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
  const current = user?.language ?? "en-US";

  async function choose(locale: string) {
    try {
      await update.mutateAsync({
        language: locale as (typeof LOCALES)[number],
      });
      void i18n.changeLanguage(locale);
      toast.success(t("saved"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("saveFailed"));
    }
  }

  return (
    <Setting
      title={t("fieldLanguages")}
      blurb={t("languageBlurb")}
      value={NAMES[current] ?? current}
      label={t("navLanguage")}
    >
      <Select
        id="language"
        value={current}
        onChange={(locale) => void choose(locale)}
        disabled={update.isPending}
        options={LOCALES.map((locale) => ({
          value: locale,
          label: NAMES[locale] ?? locale,
          hint: locale,
        }))}
        searchPlaceholder={t("languageSearchPlaceholder")}
        noResultsText={t("languageNoResults")}
        ariaLabel={t("fieldLanguages")}
        className="max-w-md"
      />
    </Setting>
  );
}

const THEMES: ThemePreference[] = ["light", "dark", "system"];

/**
 * The colour mode, which until now lived only in the account dropdown.
 *
 * Kept in both places rather than moved: the dropdown is the shortcut you use
 * when the room gets dark, and this is where someone looks when they are
 * setting the app up. A setting can have a shortcut; it still needs a home.
 *
 * Not stored on the profile — it is a property of this browser, like the
 * header's language switch, so a shared laptop does not force one person's
 * dark mode onto another's account.
 */
function AppearancePreference() {
  const { t } = useTranslation("account");
  // Read after mount. `localStorage` does not exist during the server render,
  // and seeding from it there would render one theme and hydrate another.
  const [theme, setTheme] = useState<ThemePreference>("system");
  useEffect(() => setTheme(readThemePreference()), []);

  return (
    <Setting
      title={t("appearance")}
      blurb={t("appearanceBlurb")}
      value={t(`theme.${theme}`)}
      label={t("appearanceLabel")}
    >
      <Select
        id="theme"
        value={theme}
        onChange={(next) => {
          setTheme(next as ThemePreference);
          applyThemePreference(next as ThemePreference);
        }}
        options={THEMES.map((value) => ({ value, label: t(`theme.${value}`) }))}
        ariaLabel={t("appearance")}
        className="max-w-md"
      />
    </Setting>
  );
}

export { AppearancePreference };
