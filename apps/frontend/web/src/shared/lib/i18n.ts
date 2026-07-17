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

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: "en",
    ns: ["common", "auth", "provider", "admin"],
    defaultNS: "common",
    interpolation: { escapeValue: false },
    resources: {
      en: { common: enCommon, auth: enAuth, provider: enProvider, admin: enAdmin },
      pt: { common: ptCommon, auth: ptAuth, provider: ptProvider, admin: ptAdmin },
    },
  });

export default i18n;
