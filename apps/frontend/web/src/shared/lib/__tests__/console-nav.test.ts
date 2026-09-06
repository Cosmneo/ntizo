import { describe, expect, it } from "vitest";
import { allItems, consoleNav, primaryItems, PRIMARY_TAB_COUNT, resolveUrl } from "../console-nav";

import deDEProvider from "../../locales/de-DE/provider.json";
import enUSProvider from "../../locales/en-US/provider.json";
import esESProvider from "../../locales/es-ES/provider.json";
import frFRProvider from "../../locales/fr-FR/provider.json";
import itITProvider from "../../locales/it-IT/provider.json";
import nlNLProvider from "../../locales/nl-NL/provider.json";
import ptMZProvider from "../../locales/pt-MZ/provider.json";
import ptPTProvider from "../../locales/pt-PT/provider.json";
import deDEAdmin from "../../locales/de-DE/admin.json";
import enUSAdmin from "../../locales/en-US/admin.json";
import esESAdmin from "../../locales/es-ES/admin.json";
import frFRAdmin from "../../locales/fr-FR/admin.json";
import itITAdmin from "../../locales/it-IT/admin.json";
import nlNLAdmin from "../../locales/nl-NL/admin.json";
import ptMZAdmin from "../../locales/pt-MZ/admin.json";
import ptPTAdmin from "../../locales/pt-PT/admin.json";
import deDECommon from "../../locales/de-DE/common.json";
import enUSCommon from "../../locales/en-US/common.json";
import esESCommon from "../../locales/es-ES/common.json";
import frFRCommon from "../../locales/fr-FR/common.json";
import itITCommon from "../../locales/it-IT/common.json";
import nlNLCommon from "../../locales/nl-NL/common.json";
import ptMZCommon from "../../locales/pt-MZ/common.json";
import ptPTCommon from "../../locales/pt-PT/common.json";

/**
 * A page nobody can navigate to is the same failure as a handler nobody
 * mounted — this project has shipped an unreachable page once already. The
 * literal route lists below are the file routes that exist today
 * (`routes/provider/$slug/*.tsx`, `routes/admin/*.tsx`); an item whose URL is
 * not in them points at nothing.
 */
const WORKSPACE_ROUTES = [
  "/provider/$slug/overview", "/provider/$slug/messages", "/provider/$slug/availability",
  "/provider/$slug/services", "/provider/$slug/members", "/provider/$slug/wallet",
  "/provider/$slug/activity", "/provider/$slug/settings", "/provider/$slug/notifications",
];
const PLATFORM_ROUTES = [
  "/admin/dashboard", "/admin/providers", "/admin/reviews", "/admin/users",
  "/admin/activity", "/admin/categories",
];

const BUNDLES: Record<string, Record<string, Record<string, unknown>>> = {
  provider: {
    "de-DE": deDEProvider, "en-US": enUSProvider, "es-ES": esESProvider, "fr-FR": frFRProvider,
    "it-IT": itITProvider, "nl-NL": nlNLProvider, "pt-MZ": ptMZProvider, "pt-PT": ptPTProvider,
  },
  admin: {
    "de-DE": deDEAdmin, "en-US": enUSAdmin, "es-ES": esESAdmin, "fr-FR": frFRAdmin,
    "it-IT": itITAdmin, "nl-NL": nlNLAdmin, "pt-MZ": ptMZAdmin, "pt-PT": ptPTAdmin,
  },
  common: {
    "de-DE": deDECommon, "en-US": enUSCommon, "es-ES": esESCommon, "fr-FR": frFRCommon,
    "it-IT": itITCommon, "nl-NL": nlNLCommon, "pt-MZ": ptMZCommon, "pt-PT": ptPTCommon,
  },
};
const LOCALES = Object.keys(BUNDLES.provider!);

function resolves(bundle: Record<string, unknown>, dotted: string): boolean {
  const value = dotted.split(".").reduce<unknown>(
    (o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined),
    bundle,
  );
  return typeof value === "string" && value.length > 0;
}

describe("consoleNav: shape", () => {
  it("fills the same slots in both zones — home, then Work, then Manage, each non-empty", () => {
    for (const zone of ["workspace", "platform"] as const) {
      const nav = consoleNav(zone);
      expect(nav.zone).toBe(zone);
      expect(nav.home.key).toBeTruthy();
      expect(nav.work.length).toBeGreaterThan(0);
      expect(nav.manage.length).toBeGreaterThan(0);
    }
  });

  it("puts people first in Manage in both zones — the symmetry the spec promises", () => {
    expect(consoleNav("workspace").manage[0]?.key).toBe("members");
    expect(consoleNav("platform").manage[0]?.key).toBe("users");
  });

  it("gives every item a unique key within its zone", () => {
    for (const zone of ["workspace", "platform"] as const) {
      const keys = allItems(consoleNav(zone)).map((i) => i.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe("consoleNav: reachability", () => {
  it("only links to routes that exist", () => {
    for (const item of allItems(consoleNav("workspace"))) {
      expect(WORKSPACE_ROUTES).toContain(item.url);
    }
    for (const item of allItems(consoleNav("platform"))) {
      expect(PLATFORM_ROUTES).toContain(item.url);
    }
  });

  it("links to the provider messages route exactly once", () => {
    const matches = allItems(consoleNav("workspace")).filter((i) => i.url === "/provider/$slug/messages");
    expect(matches).toHaveLength(1);
    expect(matches[0]?.titleKey).toBe("nav.messages");
  });

  it("does not list notifications — the header bell is that control", () => {
    expect(allItems(consoleNav("workspace")).some((i) => i.url.endsWith("/notifications"))).toBe(false);
  });
});

describe("consoleNav: the phone's tabs", () => {
  it("marks exactly three items primary per zone, all with a short label", () => {
    for (const zone of ["workspace", "platform"] as const) {
      const tabs = primaryItems(consoleNav(zone));
      expect(tabs).toHaveLength(PRIMARY_TAB_COUNT);
      for (const tab of tabs) expect(tab.shortKey).toBeTruthy();
    }
  });

  it("puts Messages, Calendar and Services on the provider bar, in that order, until bookings exists", () => {
    expect(primaryItems(consoleNav("workspace")).map((i) => i.key)).toEqual(["messages", "availability", "services"]);
  });

  it("puts Providers, Reviews and Users on the admin bar, in that order", () => {
    expect(primaryItems(consoleNav("platform")).map((i) => i.key)).toEqual(["providers", "reviews", "users"]);
  });
});

describe("consoleNav: every label exists in every locale", () => {
  it.each(LOCALES)("%s", (locale) => {
    for (const zone of ["workspace", "platform"] as const) {
      const nav = consoleNav(zone);
      const bundle = BUNDLES[nav.ns]![locale]!;
      expect(resolves(bundle, "nav.work")).toBe(true);
      expect(resolves(bundle, "nav.manage")).toBe(true);
      for (const item of allItems(nav)) {
        expect(resolves(bundle, item.titleKey), `${nav.ns}:${item.titleKey}`).toBe(true);
        if (item.shortKey) expect(resolves(bundle, item.shortKey), `${nav.ns}:${item.shortKey}`).toBe(true);
      }
    }
    expect(resolves(BUNDLES.common![locale]!, "menu")).toBe(true);
  });
});

describe("resolveUrl", () => {
  it("fills the slug into a workspace template", () => {
    expect(resolveUrl("/provider/$slug/messages", "casa-bela")).toBe("/provider/casa-bela/messages");
  });
  it("returns null for a workspace template with no slug yet — a link to /provider//x is worse than none", () => {
    expect(resolveUrl("/provider/$slug/messages", undefined)).toBeNull();
  });
  it("passes a platform URL through untouched", () => {
    expect(resolveUrl("/admin/providers", undefined)).toBe("/admin/providers");
  });
});
