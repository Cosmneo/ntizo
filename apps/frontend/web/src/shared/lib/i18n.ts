import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import enCommon from "@/shared/locales/en/common.json";
import enAuth from "@/shared/locales/en/auth.json";
import enProvider from "@/shared/locales/en/provider.json";
import enAdmin from "@/shared/locales/en/admin.json";
import ptCommon from "@/shared/locales/pt/common.json";
import ptAuth from "@/shared/locales/pt/auth.json";
import ptProvider from "@/shared/locales/pt/provider.json";
import ptAdmin from "@/shared/locales/pt/admin.json";
import esCommon from "@/shared/locales/es/common.json";
import esAuth from "@/shared/locales/es/auth.json";
import esProvider from "@/shared/locales/es/provider.json";
import esAdmin from "@/shared/locales/es/admin.json";
import deCommon from "@/shared/locales/de/common.json";
import deAuth from "@/shared/locales/de/auth.json";
import deProvider from "@/shared/locales/de/provider.json";
import deAdmin from "@/shared/locales/de/admin.json";
import frCommon from "@/shared/locales/fr/common.json";
import frAuth from "@/shared/locales/fr/auth.json";
import frProvider from "@/shared/locales/fr/provider.json";
import frAdmin from "@/shared/locales/fr/admin.json";
import itCommon from "@/shared/locales/it/common.json";
import itAuth from "@/shared/locales/it/auth.json";
import itProvider from "@/shared/locales/it/provider.json";
import itAdmin from "@/shared/locales/it/admin.json";
import nlCommon from "@/shared/locales/nl/common.json";
import nlAuth from "@/shared/locales/nl/auth.json";
import nlProvider from "@/shared/locales/nl/provider.json";
import nlAdmin from "@/shared/locales/nl/admin.json";

/**
 * Base language codes, not regional ones. i18next resolves a regional tag to
 * its base automatically — `pt-MZ` and `pt-PT` both land on `pt`, `en-GB` on
 * `en` — so one file per language serves every region of it. Splitting `pt-MZ`
 * from `pt-PT` only becomes worth it if the copy itself has to differ.
 *
 * The backend's `Locale` enum uses regional codes because it stores a user's
 * stated preference; this map is what renders it. `resources` and that enum
 * are checked against each other by `__tests__/i18n-parity.test.ts`.
 */
const resources = {
  en: { common: enCommon, auth: enAuth, provider: enProvider, admin: enAdmin },
  pt: { common: ptCommon, auth: ptAuth, provider: ptProvider, admin: ptAdmin },
  es: { common: esCommon, auth: esAuth, provider: esProvider, admin: esAdmin },
  de: { common: deCommon, auth: deAuth, provider: deProvider, admin: deAdmin },
  fr: { common: frCommon, auth: frAuth, provider: frProvider, admin: frAdmin },
  it: { common: itCommon, auth: itAuth, provider: itProvider, admin: itAdmin },
  nl: { common: nlCommon, auth: nlAuth, provider: nlProvider, admin: nlAdmin }
};

export const SUPPORTED_LANGUAGES = Object.keys(resources) as (keyof typeof resources)[];

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: "en",
    ns: ["common", "auth", "provider", "admin"],
    defaultNS: "common",
    interpolation: { escapeValue: false },
    resources,
  });

export default i18n;
