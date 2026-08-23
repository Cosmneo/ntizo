import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import enUSCommon from "@/shared/locales/en-US/common.json";
import enUSAuth from "@/shared/locales/en-US/auth.json";
import enUSProvider from "@/shared/locales/en-US/provider.json";
import enUSAdmin from "@/shared/locales/en-US/admin.json";
import enUSDirectory from "@/shared/locales/en-US/directory.json";
import enUSLanding from "@/shared/locales/en-US/landing.json";
import enUSAccount from "@/shared/locales/en-US/account.json";
import enUSBecomeProvider from "@/shared/locales/en-US/become-provider.json";
import enUSOnboarding from "@/shared/locales/en-US/onboarding.json";
import enUSNotifications from "@/shared/locales/en-US/notifications.json";
import ptPTCommon from "@/shared/locales/pt-PT/common.json";
import ptPTAuth from "@/shared/locales/pt-PT/auth.json";
import ptPTProvider from "@/shared/locales/pt-PT/provider.json";
import ptPTAdmin from "@/shared/locales/pt-PT/admin.json";
import ptPTDirectory from "@/shared/locales/pt-PT/directory.json";
import ptPTLanding from "@/shared/locales/pt-PT/landing.json";
import ptPTAccount from "@/shared/locales/pt-PT/account.json";
import ptPTBecomeProvider from "@/shared/locales/pt-PT/become-provider.json";
import ptPTOnboarding from "@/shared/locales/pt-PT/onboarding.json";
import ptPTNotifications from "@/shared/locales/pt-PT/notifications.json";
import ptMZCommon from "@/shared/locales/pt-MZ/common.json";
import ptMZAuth from "@/shared/locales/pt-MZ/auth.json";
import ptMZProvider from "@/shared/locales/pt-MZ/provider.json";
import ptMZAdmin from "@/shared/locales/pt-MZ/admin.json";
import ptMZDirectory from "@/shared/locales/pt-MZ/directory.json";
import ptMZLanding from "@/shared/locales/pt-MZ/landing.json";
import ptMZAccount from "@/shared/locales/pt-MZ/account.json";
import ptMZBecomeProvider from "@/shared/locales/pt-MZ/become-provider.json";
import ptMZOnboarding from "@/shared/locales/pt-MZ/onboarding.json";
import ptMZNotifications from "@/shared/locales/pt-MZ/notifications.json";
import esESCommon from "@/shared/locales/es-ES/common.json";
import esESAuth from "@/shared/locales/es-ES/auth.json";
import esESProvider from "@/shared/locales/es-ES/provider.json";
import esESAdmin from "@/shared/locales/es-ES/admin.json";
import esESDirectory from "@/shared/locales/es-ES/directory.json";
import esESLanding from "@/shared/locales/es-ES/landing.json";
import esESAccount from "@/shared/locales/es-ES/account.json";
import esESBecomeProvider from "@/shared/locales/es-ES/become-provider.json";
import esESOnboarding from "@/shared/locales/es-ES/onboarding.json";
import esESNotifications from "@/shared/locales/es-ES/notifications.json";
import deDECommon from "@/shared/locales/de-DE/common.json";
import deDEAuth from "@/shared/locales/de-DE/auth.json";
import deDEProvider from "@/shared/locales/de-DE/provider.json";
import deDEAdmin from "@/shared/locales/de-DE/admin.json";
import deDEDirectory from "@/shared/locales/de-DE/directory.json";
import deDELanding from "@/shared/locales/de-DE/landing.json";
import deDEAccount from "@/shared/locales/de-DE/account.json";
import deDEBecomeProvider from "@/shared/locales/de-DE/become-provider.json";
import deDEOnboarding from "@/shared/locales/de-DE/onboarding.json";
import deDENotifications from "@/shared/locales/de-DE/notifications.json";
import frFRCommon from "@/shared/locales/fr-FR/common.json";
import frFRAuth from "@/shared/locales/fr-FR/auth.json";
import frFRProvider from "@/shared/locales/fr-FR/provider.json";
import frFRAdmin from "@/shared/locales/fr-FR/admin.json";
import frFRDirectory from "@/shared/locales/fr-FR/directory.json";
import frFRLanding from "@/shared/locales/fr-FR/landing.json";
import frFRAccount from "@/shared/locales/fr-FR/account.json";
import frFRBecomeProvider from "@/shared/locales/fr-FR/become-provider.json";
import frFROnboarding from "@/shared/locales/fr-FR/onboarding.json";
import frFRNotifications from "@/shared/locales/fr-FR/notifications.json";
import itITCommon from "@/shared/locales/it-IT/common.json";
import itITAuth from "@/shared/locales/it-IT/auth.json";
import itITProvider from "@/shared/locales/it-IT/provider.json";
import itITAdmin from "@/shared/locales/it-IT/admin.json";
import itITDirectory from "@/shared/locales/it-IT/directory.json";
import itITLanding from "@/shared/locales/it-IT/landing.json";
import itITAccount from "@/shared/locales/it-IT/account.json";
import itITBecomeProvider from "@/shared/locales/it-IT/become-provider.json";
import itITOnboarding from "@/shared/locales/it-IT/onboarding.json";
import itITNotifications from "@/shared/locales/it-IT/notifications.json";
import nlNLCommon from "@/shared/locales/nl-NL/common.json";
import nlNLAuth from "@/shared/locales/nl-NL/auth.json";
import nlNLProvider from "@/shared/locales/nl-NL/provider.json";
import nlNLAdmin from "@/shared/locales/nl-NL/admin.json";
import nlNLDirectory from "@/shared/locales/nl-NL/directory.json";
import nlNLLanding from "@/shared/locales/nl-NL/landing.json";
import nlNLAccount from "@/shared/locales/nl-NL/account.json";
import nlNLBecomeProvider from "@/shared/locales/nl-NL/become-provider.json";
import nlNLOnboarding from "@/shared/locales/nl-NL/onboarding.json";
import nlNLNotifications from "@/shared/locales/nl-NL/notifications.json";

/**
 * Regional locale codes, matching the backend"s `Locale` enum and the doazores
 * storefront. `pt-MZ` is a real, separate file rather than an alias of
 * `pt-PT`: Mozambique is the launch market, and the two Portugueses differ in
 * places a marketplace notices — "telemóvel" versus "celular", currency
 * conventions, forms of address. It ships as a copy of pt-PT today and can
 * diverge a string at a time without another rename.
 *
 * `fallbackLng` is a MAP, not a single string. i18next resolves a specific tag
 * down to a general one (pt-BR -> pt) but never the other way, so a browser
 * sending bare `pt` would find no `pt` resource and fall straight through to
 * English. The per-language entries catch that: `pt` lands on Mozambique"s
 * Portuguese, not Portugal"s, because that is who this launches for.
 */
const resources = {
  "en-US": { common: enUSCommon, auth: enUSAuth, provider: enUSProvider, admin: enUSAdmin, directory: enUSDirectory, landing: enUSLanding, account: enUSAccount, becomeProvider: enUSBecomeProvider, onboarding: enUSOnboarding, notifications: enUSNotifications },
  "pt-PT": { common: ptPTCommon, auth: ptPTAuth, provider: ptPTProvider, admin: ptPTAdmin, directory: ptPTDirectory, landing: ptPTLanding, account: ptPTAccount, becomeProvider: ptPTBecomeProvider, onboarding: ptPTOnboarding, notifications: ptPTNotifications },
  "pt-MZ": { common: ptMZCommon, auth: ptMZAuth, provider: ptMZProvider, admin: ptMZAdmin, directory: ptMZDirectory, landing: ptMZLanding, account: ptMZAccount, becomeProvider: ptMZBecomeProvider, onboarding: ptMZOnboarding, notifications: ptMZNotifications },
  "es-ES": { common: esESCommon, auth: esESAuth, provider: esESProvider, admin: esESAdmin, directory: esESDirectory, landing: esESLanding, account: esESAccount, becomeProvider: esESBecomeProvider, onboarding: esESOnboarding, notifications: esESNotifications },
  "de-DE": { common: deDECommon, auth: deDEAuth, provider: deDEProvider, admin: deDEAdmin, directory: deDEDirectory, landing: deDELanding, account: deDEAccount, becomeProvider: deDEBecomeProvider, onboarding: deDEOnboarding, notifications: deDENotifications },
  "fr-FR": { common: frFRCommon, auth: frFRAuth, provider: frFRProvider, admin: frFRAdmin, directory: frFRDirectory, landing: frFRLanding, account: frFRAccount, becomeProvider: frFRBecomeProvider, onboarding: frFROnboarding, notifications: frFRNotifications },
  "it-IT": { common: itITCommon, auth: itITAuth, provider: itITProvider, admin: itITAdmin, directory: itITDirectory, landing: itITLanding, account: itITAccount, becomeProvider: itITBecomeProvider, onboarding: itITOnboarding, notifications: itITNotifications },
  "nl-NL": { common: nlNLCommon, auth: nlNLAuth, provider: nlNLProvider, admin: nlNLAdmin, directory: nlNLDirectory, landing: nlNLLanding, account: nlNLAccount, becomeProvider: nlNLBecomeProvider, onboarding: nlNLOnboarding, notifications: nlNLNotifications }
};

export const SUPPORTED_LOCALES = Object.keys(resources) as (keyof typeof resources)[];

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: {
      pt: ["pt-MZ", "pt-PT", "en-US"],
      en: ["en-US"],
      es: ["es-ES", "en-US"],
      de: ["de-DE", "en-US"],
      fr: ["fr-FR", "en-US"],
      it: ["it-IT", "en-US"],
      nl: ["nl-NL", "en-US"],
      default: ["en-US"],
    },
    ns: ["common", "auth", "provider", "admin", "directory", "landing", "account", "notifications"],
    defaultNS: "common",
    interpolation: { escapeValue: false },
    resources,
  });

export default i18n;
