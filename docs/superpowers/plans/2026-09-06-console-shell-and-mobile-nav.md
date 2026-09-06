# Console Shell and Mobile Navigation — Implementation Plan (Phases 1 + 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two near-identical console shells with one `ConsoleShell` parameterised by zone, driven by one nav schema, and give it the phone navigation the consoles lack — a bottom tab bar and a menu sheet — shipping both as one release.

**Architecture:** A `consoleNav(zone)` function returns `{ home, work, manage }`; the sidebar, the tab bar and the menu sheet all render from it. `ConsoleShell` branches once, by zone, into `WorkspaceShell` / `PlatformShell` (each calling only its own data hooks) and both render one `ShellFrame`. Two small contexts — a bottom-edge counter and the sheet's open state — let a screen displace the tab bar and let the Menu tab open the sheet. The workspace-status sentence moves from Overview into the shell strip. Old files are deleted, not wrapped.

**Tech Stack:** React 19, TanStack Router (file routes, `Link`, `useRouterState`), TanStack Query, react-i18next (8 locales), Tailwind v4 over the tokens in `packages/frontend/src/styles/globals.css`, `@ntizo/frontend-ui` (`Sidebar*`, `Sheet`, `StickyActionBar`, `Button`, `Separator`), Vitest + Testing Library + jsdom, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-06-console-navigation-design.md` — read it first; this plan argues from it. The visual reference is the artifact linked at the top of the spec (Fig. 1–5 cover this plan).

## Global Constraints

- **Package manager is bun.** Web tests: `cd apps/frontend/web && bun run vitest run <path>`. Typecheck: `bun run typecheck`. Lint: `bun run lint`. All three from `apps/frontend/web`. The e2e harness runs from the repo root: `bun run e2e`.
- **Every commit ends with these two trailer lines** (the session's attribution rule):
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_0137neNHJJv594fiF8cKvt5v`.
  Commit only the files a task names. The working tree may hold other people's changes; never `git add -A`.
- **Never delete a file before its replacement's tests pass.** Deletions are their own steps, after green.
- **No new colours, no new breakpoints.** Only the tokens in `globals.css` and only `md` (768px) and `lg` (1024px) — the spec's rule 3.
- **Copy is translated.** Every new string goes into all eight locale files (`de-DE en-US es-ES fr-FR it-IT nl-NL pt-MZ pt-PT`) in the same task that introduces it. The exact strings are given; do not invent others.
- **The e2e helper `signOutViaSidebar` (apps/e2e/fixtures/ui.ts) clicks `[data-sidebar="menu-button"]` containing the signed-in user's name, then `menuitem` "Sign out".** `ConsoleUserMenu` must keep rendering the user's name inside a `SidebarMenuButton` and keep "Sign out" as a menu item.
- **Deviations from the spec, decided while planning** (both simplify, neither changes behaviour):
  1. The tab bar is an in-flow last child of `SidebarInset`, not a fixed overlay, so `main` needs no bottom padding — `SidebarInset` is already a fixed-height flex column in which only `main` scrolls.
  2. The header bell becomes always visible (it is `hidden sm:inline-flex` today). Notifications leaves the sidebar and has no tab; without this a phone has no route to the inbox. The search field and the hamburger are leaving the same row, so it fits.
  3. The spec's rule 2 says "exactly four items per zone carry `primary`, and the fourth is Menu". Menu is not a nav item — it is the tab bar's own control — so the schema marks exactly **three** items `primary` (`PRIMARY_TAB_COUNT = 3`) and the bar appends Menu. Same four tabs on screen; the test asserts three.

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `apps/frontend/web/src/shared/lib/console-nav.ts` | The one nav schema: `consoleNav(zone)`, `allItems`, `primaryItems`, `resolveUrl` |
| `apps/frontend/web/src/shared/lib/__tests__/console-nav.test.ts` | Structure, reachability, primary count, locale key resolution |
| `apps/frontend/web/src/shared/lib/console-bottom-edge.tsx` | `BottomEdgeProvider`, `useOwnsBottomEdge`, `useBottomEdgeOwned` — a counter, not a boolean |
| `apps/frontend/web/src/shared/lib/__tests__/console-bottom-edge.test.tsx` | Two claimants, release one, still owned |
| `apps/frontend/web/src/shared/hooks/use-is-tablet.ts` | `(min-width:768px) and (max-width:1023px)` — the icon-rail default |
| `apps/frontend/web/src/shared/components/console/console-strip.tsx` | Commission, or the not-live sentence. Pure: props in, no hooks but `useTranslation` |
| `apps/frontend/web/src/shared/components/console/console-strip.test.tsx` | Ports `workspace-status-notice.test.tsx` |
| `apps/frontend/web/src/shared/components/console/workspace-switcher.tsx` | `WorkspaceSwitcher` (dropdown sub-menu) and `MobileWorkspaceSwitcher` (sheet header) |
| `apps/frontend/web/src/shared/components/console/console-user-menu.tsx` | The account menu at the sidebar's foot; zone passes the switcher as children |
| `apps/frontend/web/src/shared/components/console/console-user-menu.test.tsx` | Switcher present only when given; sign-out item present |
| `apps/frontend/web/src/shared/components/console/console-header.tsx` | Title/subtitle/action from `PageHeaderContext`; trigger hidden below `md`; the bell slot |
| `apps/frontend/web/src/shared/components/console/console-page.tsx` | The one page width |
| `apps/frontend/web/src/shared/components/console/console-nav-items.tsx` | Home row, Work group, Manage group, badges (dot when collapsed) |
| `apps/frontend/web/src/shared/components/console/console-sidebar.tsx` | Masthead + `ConsoleNavItems` + `ConsoleUserMenu` + `SidebarRail` |
| `apps/frontend/web/src/shared/components/console/console-shell.tsx` | `ConsoleShell` → `WorkspaceShell` / `PlatformShell` → `ShellFrame` |
| `apps/frontend/web/src/shared/components/console/console-shell.test.tsx` | Ports `provider-shell.test.tsx`; adds platform zone, no fallback action, no strip in admin |
| `apps/frontend/web/src/shared/components/console/console-menu-context.tsx` | `ConsoleMenuProvider`, `useConsoleMenu` — the sheet's open state |
| `apps/frontend/web/src/shared/components/console/console-counts.tsx` | `ConsoleCountsProvider` (zone-branched) and `useConsoleCounts` |
| `apps/frontend/web/src/shared/components/console/console-counts.test.tsx` | Unread threads → count; empty providerId → no count |
| `apps/frontend/web/src/shared/components/console/console-tab-bar.tsx` | Three `primary` links + Menu; hidden while the bottom edge is owned |
| `apps/frontend/web/src/shared/components/console/console-menu-sheet.tsx` | The sidebar as a bottom sheet; Escape, backdrop, navigate to close; focus trap |
| `apps/frontend/web/src/shared/components/console/console-action-bar.tsx` | `StickyActionBar` + `useOwnsBottomEdge()` |
| `apps/frontend/web/src/shared/components/console/console-mobile.test.tsx` | Tab bar, sheet open/close/focus, bottom-edge displacement |
| `apps/e2e/tests/console-mobile.spec.ts` | `@mobile` — bar visible, hamburger hidden, sheet opens and closes |

**Modified**

| File | Change |
|---|---|
| `apps/frontend/web/src/routes/provider/route.tsx` | `ProviderShell` → `ConsoleShell zone="workspace"` |
| `apps/frontend/web/src/routes/admin/route.tsx` | `AdminShell` → `ConsoleShell zone="platform"` |
| `apps/frontend/web/src/features/provider/ui/overview.tsx` | Remove `WorkspaceStatusNotice` |
| `apps/frontend/web/src/features/provider/services/ui/services-page.tsx:19,99` | Remove `WorkspaceStatusNotice` |
| `apps/frontend/web/src/shared/locales/*/provider.json` ×8 | `nav.manage`, `navShort.{messages,availability,services}` |
| `apps/frontend/web/src/shared/locales/*/admin.json` ×8 | `nav.work`, `nav.manage`, `navShort.{providers,reviews,users}` |
| `apps/frontend/web/src/shared/locales/*/common.json` ×8 | `menu` |
| `apps/e2e/playwright.config.ts:73-88` | A `mobile` project; `chromium` excludes `@mobile` |

**Deleted** (Task 7, after everything else is green)

`shared/components/provider-shell.tsx`, `provider-shell.test.tsx`, `admin-shell.tsx`, `app-sidebar/` (4 files), `admin-sidebar/` (4 files), `shared/lib/navigation.ts`, `shared/lib/admin-navigation.ts`, `shared/lib/__tests__/navigation.test.ts`, `features/provider/ui/workspace-status-notice.tsx`, `features/provider/ui/__tests__/workspace-status-notice.test.tsx`.

---

## Phase 1 — One shell

### Task 1: The nav schema and its strings

**Files:**
- Create: `apps/frontend/web/src/shared/lib/console-nav.ts`
- Create: `apps/frontend/web/src/shared/lib/__tests__/console-nav.test.ts`
- Modify: `apps/frontend/web/src/shared/locales/{de-DE,en-US,es-ES,fr-FR,it-IT,nl-NL,pt-MZ,pt-PT}/{provider,admin,common}.json`

**Interfaces:**
- Consumes: nothing from this plan.
- Produces:
  ```ts
  export type ConsoleZone = "workspace" | "platform";
  export type ConsoleCountSource = "unreadThreads" | "bookingRequests" | "pendingProviders" | "flaggedReviews";
  export interface ConsoleNavItem { key: string; titleKey: string; shortKey?: string; url: string; icon: LucideIcon; primary?: true; count?: ConsoleCountSource; }
  export interface ConsoleNav { zone: ConsoleZone; ns: "provider" | "admin"; home: ConsoleNavItem; work: readonly ConsoleNavItem[]; manage: readonly ConsoleNavItem[]; }
  export const PRIMARY_TAB_COUNT = 3;
  export function consoleNav(zone: ConsoleZone): ConsoleNav;
  export function allItems(nav: ConsoleNav): ConsoleNavItem[];
  export function primaryItems(nav: ConsoleNav): ConsoleNavItem[];
  export function resolveUrl(url: string, slug: string | undefined): string | null;
  ```

- [ ] **Step 1: Write the failing test**

`apps/frontend/web/src/shared/lib/__tests__/console-nav.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd apps/frontend/web && bun run vitest run src/shared/lib/__tests__/console-nav.test.ts`
Expected: FAIL — `Cannot find module '../console-nav'`.

- [ ] **Step 3: Add the strings to all 24 locale files**

Run this from `apps/frontend/web/src/shared/locales`. It inserts keys and preserves each file's key order (Python's `json` keeps insertion order; existing keys are untouched):

```python
python3 - << 'PY'
import json, pathlib

WORK   = {"de-DE":"Arbeit","en-US":"Work","es-ES":"Trabajo","fr-FR":"Travail","it-IT":"Lavoro","nl-NL":"Werk","pt-MZ":"Trabalho","pt-PT":"Trabalho"}
MANAGE = {"de-DE":"Verwalten","en-US":"Manage","es-ES":"Gestionar","fr-FR":"Gérer","it-IT":"Gestire","nl-NL":"Beheren","pt-MZ":"Gerir","pt-PT":"Gerir"}
MENU   = {"de-DE":"Menü","en-US":"Menu","es-ES":"Menú","fr-FR":"Menu","it-IT":"Menu","nl-NL":"Menu","pt-MZ":"Menu","pt-PT":"Menu"}
SHORT_PROVIDER = {
  "de-DE": {"messages":"Nachrichten","availability":"Kalender","services":"Leistungen"},
  "en-US": {"messages":"Messages","availability":"Calendar","services":"Services"},
  "es-ES": {"messages":"Mensajes","availability":"Agenda","services":"Servicios"},
  "fr-FR": {"messages":"Messages","availability":"Agenda","services":"Services"},
  "it-IT": {"messages":"Messaggi","availability":"Agenda","services":"Servizi"},
  "nl-NL": {"messages":"Berichten","availability":"Agenda","services":"Diensten"},
  "pt-MZ": {"messages":"Mensagens","availability":"Agenda","services":"Serviços"},
  "pt-PT": {"messages":"Mensagens","availability":"Agenda","services":"Serviços"},
}
SHORT_ADMIN = {
  "de-DE": {"providers":"Anbieter","reviews":"Bewertungen","users":"Benutzer"},
  "en-US": {"providers":"Providers","reviews":"Reviews","users":"Users"},
  "es-ES": {"providers":"Proveedores","reviews":"Reseñas","users":"Usuarios"},
  "fr-FR": {"providers":"Prestataires","reviews":"Avis","users":"Utilisateurs"},
  "it-IT": {"providers":"Operatori","reviews":"Recensioni","users":"Utenti"},
  "nl-NL": {"providers":"Aanbieders","reviews":"Reviews","users":"Gebruikers"},
  "pt-MZ": {"providers":"Prestadores","reviews":"Avaliações","users":"Utilizadores"},
  "pt-PT": {"providers":"Prestadores","reviews":"Avaliações","users":"Utilizadores"},
}

def edit(path, fn):
    p = pathlib.Path(path)
    d = json.loads(p.read_text(encoding="utf-8"))
    fn(d)
    p.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

for loc in WORK:
    def prov(d, loc=loc):
        d["nav"]["work"] = WORK[loc]
        d["nav"]["manage"] = MANAGE[loc]
        d["navShort"] = SHORT_PROVIDER[loc]
    def adm(d, loc=loc):
        d["nav"]["work"] = WORK[loc]
        d["nav"]["manage"] = MANAGE[loc]
        d["navShort"] = SHORT_ADMIN[loc]
    def com(d, loc=loc):
        d["menu"] = MENU[loc]
    edit(f"{loc}/provider.json", prov)
    edit(f"{loc}/admin.json", adm)
    edit(f"{loc}/common.json", com)
print("24 files updated")
PY
```

Then check the diff is additions only: `git diff --stat -- src/shared/locales` should show 24 files with small `+` counts and no large `-` counts. If a file shows many removals, its original indentation was not two spaces — revert that file (`git checkout -- <file>`) and add the same keys by hand with the editor, keeping its indentation.

- [ ] **Step 4: Write the schema**

`apps/frontend/web/src/shared/lib/console-nav.ts`:

```ts
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Briefcase,
  CalendarClock,
  LayoutDashboard,
  MessageSquare,
  MessageSquareQuote,
  Settings,
  Store,
  Tags,
  Users,
  Wallet,
} from "lucide-react";

export type ConsoleZone = "workspace" | "platform";

/**
 * Where a badge's number comes from. A name, not a number: an item declares
 * that it carries a count and the shell resolves it against the reads it
 * already has in scope (`console-counts.tsx`). A source with no read behind
 * it yet resolves to `undefined` and draws nothing — `bookingRequests` until
 * the bookings plan lands its stats read, `flaggedReviews` until the reviews
 * read exposes a pending count.
 */
export type ConsoleCountSource =
  | "unreadThreads"
  | "bookingRequests"
  | "pendingProviders"
  | "flaggedReviews";

export interface ConsoleNavItem {
  /** Stable identity for tests and React keys. Never shown. */
  key: string;
  /** The sidebar and sheet label, in the zone's namespace. */
  titleKey: string;
  /**
   * The tab-bar label — its own key, never the sidebar string truncated.
   * German's "Verfügbarkeit" does not fit a 97px tab at 10px; "Kalender" does.
   */
  shortKey?: string;
  /** A route template. Workspace URLs carry `$slug`; see `resolveUrl`. */
  url: string;
  icon: LucideIcon;
  /** One of the phone's three tabs. Exactly three per zone; the fourth is always Menu. */
  primary?: true;
  count?: ConsoleCountSource;
}

export interface ConsoleNav {
  zone: ConsoleZone;
  /** The i18n namespace every `titleKey` and `shortKey` resolves in. */
  ns: "provider" | "admin";
  /** Ungrouped, above both groups: the summary of the pair. */
  home: ConsoleNavItem;
  /** What arrives and can be owed. */
  work: readonly ConsoleNavItem[];
  /** What is true. */
  manage: readonly ConsoleNavItem[];
}

export const PRIMARY_TAB_COUNT = 3;

/**
 * The workspace zone: the business, and nothing else. No personal account
 * here — that belongs to the person and lives in the customer zone. No
 * notifications item either: the header bell is that control, and two
 * controls for one destination is one too many.
 */
const WORKSPACE: ConsoleNav = {
  zone: "workspace",
  ns: "provider",
  home: { key: "overview", titleKey: "nav.overview", url: "/provider/$slug/overview", icon: LayoutDashboard },
  work: [
    // When the bookings plan lands, Bookings goes first here as `primary`
    // with `count: "bookingRequests"`, and Services gives up its `primary`.
    // `console-nav.test.ts` holds the count at three.
    { key: "messages", titleKey: "nav.messages", shortKey: "navShort.messages", url: "/provider/$slug/messages", icon: MessageSquare, primary: true, count: "unreadThreads" },
    { key: "availability", titleKey: "nav.availability", shortKey: "navShort.availability", url: "/provider/$slug/availability", icon: CalendarClock, primary: true },
    { key: "services", titleKey: "nav.services", shortKey: "navShort.services", url: "/provider/$slug/services", icon: Briefcase, primary: true },
  ],
  manage: [
    { key: "members", titleKey: "nav.members", url: "/provider/$slug/members", icon: Users },
    { key: "wallet", titleKey: "nav.wallet", url: "/provider/$slug/wallet", icon: Wallet },
    { key: "activity", titleKey: "nav.activity", url: "/provider/$slug/activity", icon: Activity },
    { key: "settings", titleKey: "nav.settings", url: "/provider/$slug/settings", icon: Settings },
  ],
};

/** The platform zone: the same slots, filled by the platform. */
const PLATFORM: ConsoleNav = {
  zone: "platform",
  ns: "admin",
  home: { key: "dashboard", titleKey: "nav.dashboard", url: "/admin/dashboard", icon: LayoutDashboard },
  work: [
    { key: "providers", titleKey: "nav.providers", shortKey: "navShort.providers", url: "/admin/providers", icon: Store, primary: true, count: "pendingProviders" },
    { key: "reviews", titleKey: "nav.reviews", shortKey: "navShort.reviews", url: "/admin/reviews", icon: MessageSquareQuote, primary: true, count: "flaggedReviews" },
  ],
  manage: [
    // Users is the platform's people registry, as Members is the
    // workspace's — a fact you look up, not a queue that arrives. It takes a
    // tab because it is the third thing an admin opens on a phone.
    { key: "users", titleKey: "nav.users", shortKey: "navShort.users", url: "/admin/users", icon: Users, primary: true },
    { key: "activity", titleKey: "nav.activity", url: "/admin/activity", icon: Activity },
    { key: "categories", titleKey: "nav.categories", url: "/admin/categories", icon: Tags },
  ],
};

export function consoleNav(zone: ConsoleZone): ConsoleNav {
  return zone === "workspace" ? WORKSPACE : PLATFORM;
}

/** Home, then Work, then Manage — the order every rendering uses. */
export function allItems(nav: ConsoleNav): ConsoleNavItem[] {
  return [nav.home, ...nav.work, ...nav.manage];
}

/** The phone's tabs, in sidebar order. */
export function primaryItems(nav: ConsoleNav): ConsoleNavItem[] {
  return allItems(nav).filter((item) => item.primary === true);
}

/**
 * A template into a path — or `null` when the template needs a slug and there
 * is none yet, the moment before `useActiveProvider` resolves. A link to
 * `/provider//messages` is worse than no link.
 */
export function resolveUrl(url: string, slug: string | undefined): string | null {
  if (!url.includes("$slug")) return url;
  if (!slug) return null;
  return url.replace("$slug", slug);
}
```

- [ ] **Step 5: Run the test**

Run: `cd apps/frontend/web && bun run vitest run src/shared/lib/__tests__/console-nav.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 6: Commit**

```bash
cd apps/frontend/web
git add src/shared/lib/console-nav.ts src/shared/lib/__tests__/console-nav.test.ts src/shared/locales
git commit -m "feat(console): one nav schema for both zones, and the strings the phone's tabs need" \
  -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" \
  -m "Claude-Session: https://claude.ai/code/session_0137neNHJJv594fiF8cKvt5v"
```

---

### Task 2: The strip — commission, or why the workspace is invisible

**Files:**
- Create: `apps/frontend/web/src/shared/components/console/console-strip.tsx`
- Create: `apps/frontend/web/src/shared/components/console/console-strip.test.tsx`

**Interfaces:**
- Consumes: `isWorkspaceLive` from `@/features/provider/domain/workspace-status`; `ProviderStatus` from `@/features/provider/domain/types`.
- Produces: `export function ConsoleStrip(props: { status: ProviderStatus; commission: string | null }): JSX.Element`.

- [ ] **Step 1: Write the failing test** (ports `features/provider/ui/__tests__/workspace-status-notice.test.tsx`; the "no workspace at all" case moves to the shell test in Task 6, because the shell is what decides not to render the strip)

`apps/frontend/web/src/shared/components/console/console-strip.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("react-i18next", () => ({
  // The key back, so an assertion names the string that would render rather
  // than the English that happens to sit behind it today.
  useTranslation: () => ({ t: (k: string) => k }),
}));

const { ConsoleStrip } = await import("./console-strip");

describe("ConsoleStrip", () => {
  it("shows the commission for a live workspace, and no status sentence", () => {
    render(<ConsoleStrip status="active" commission="12%" />);
    expect(screen.getByText("commissionRateLabel")).toBeInTheDocument();
    expect(screen.getByText("12%")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows an em dash when the rate is not known yet", () => {
    render(<ConsoleStrip status="active" commission={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("tells a workspace awaiting approval that nothing it publishes is visible", () => {
    // The gap this closes: the dashboard said "published" and the browse had
    // never heard of them, with nothing anywhere explaining the difference.
    render(<ConsoleStrip status="pending" commission="12%" />);
    expect(screen.getByRole("status")).toHaveTextContent("workspaceStatus.pendingTitle");
    expect(screen.getByText("workspaceStatus.pendingBody")).toBeInTheDocument();
    expect(screen.queryByText("commissionRateLabel")).not.toBeInTheDocument();
  });

  it("distinguishes a suspended workspace from one still being reviewed", () => {
    render(<ConsoleStrip status="suspended" commission="12%" />);
    expect(screen.getByText("workspaceStatus.suspendedTitle")).toBeInTheDocument();
    expect(screen.queryByText("workspaceStatus.pendingTitle")).not.toBeInTheDocument();
  });

  it("treats a status it has never seen as not live", () => {
    // The column is plain text on the server. An unrecognised value must not
    // read as "fine" — silent optimism is the bug being fixed.
    render(<ConsoleStrip status="something-new" commission="12%" />);
    expect(screen.getByText("workspaceStatus.pendingTitle")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd apps/frontend/web && bun run vitest run src/shared/components/console/console-strip.test.tsx`
Expected: FAIL — `Cannot find module './console-strip'`.

- [ ] **Step 3: Write the component**

`apps/frontend/web/src/shared/components/console/console-strip.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { AlertTriangle, Clock, Percent } from "lucide-react";
import { cn } from "@ntizo/frontend-ui";
import type { ProviderStatus } from "@/features/provider/domain/types";
import { isWorkspaceLive } from "@/features/provider/domain/workspace-status";

/**
 * The row under the header, carrying whichever fact about the workspace is
 * true right now: the platform's share when it is live, or why nothing it
 * publishes can be seen when it is not.
 *
 * In the shell, not on Overview — for the reason the commission was already
 * here: a bookmark straight to `/services/new` or an already-open tab never
 * passes through Overview, and a workspace that has been sitting unapproved
 * for ten days has to be told so on every screen, not the one it happens not
 * to open.
 *
 * Pending and suspended stay told apart. Both mean invisible, but one is
 * waiting on us and the other is a decision already taken, and a provider can
 * only act on the difference.
 *
 * Its own row rather than a squeeze into the header: that row already once
 * collided on a 390px screen, and this is the one element a Terms clause
 * depends on.
 */
export function ConsoleStrip({
  status,
  commission,
}: {
  status: ProviderStatus;
  /** Already formatted for the locale, or null while the detail is loading. */
  commission: string | null;
}) {
  const { t } = useTranslation("provider");

  if (isWorkspaceLive(status)) {
    return (
      <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-sidebar-border bg-muted/40 px-4 text-xs text-muted-foreground sm:px-6">
        <Percent className="h-3 w-3 shrink-0" aria-hidden="true" />
        {/* `min-w-0` beside `truncate`: a flex child defaults to
            `min-width: auto` and refuses to shrink, so `truncate` alone does
            nothing and the row overflows instead. */}
        <span className="min-w-0 truncate">{t("commissionRateLabel")}</span>
        <span className="shrink-0 font-medium text-foreground">{commission ?? "—"}</span>
      </div>
    );
  }

  const suspended = status === "suspended";
  const Icon = suspended ? AlertTriangle : Clock;
  return (
    <div
      role="status"
      className={cn(
        "flex min-h-8 shrink-0 items-center gap-1.5 border-b border-sidebar-border px-4 py-1 text-xs sm:px-6",
        suspended
          ? "bg-[color-mix(in_srgb,var(--color-destructive)_10%,transparent)] text-[var(--color-destructive)]"
          : "bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] text-[var(--color-foreground)]",
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="shrink-0 font-medium">
        {t(suspended ? "workspaceStatus.suspendedTitle" : "workspaceStatus.pendingTitle")}
      </span>
      {/* The sentence that explains it, where there is room. On a phone the
          title alone is the honest amount that fits on one row. */}
      <span className="hidden min-w-0 truncate text-[var(--color-muted-foreground)] sm:inline">
        {t(suspended ? "workspaceStatus.suspendedBody" : "workspaceStatus.pendingBody")}
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Run the test**

Run: `cd apps/frontend/web && bun run vitest run src/shared/components/console/console-strip.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
cd apps/frontend/web
git add src/shared/components/console/console-strip.tsx src/shared/components/console/console-strip.test.tsx
git commit -m "feat(console): the strip carries the commission, or why the workspace is invisible" \
  -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" \
  -m "Claude-Session: https://claude.ai/code/session_0137neNHJJv594fiF8cKvt5v"
```

---

### Task 3: The account menu, with the workspace switcher as a slot

**Files:**
- Create: `apps/frontend/web/src/shared/components/console/workspace-switcher.tsx`
- Create: `apps/frontend/web/src/shared/components/console/console-user-menu.tsx`
- Create: `apps/frontend/web/src/shared/components/console/console-user-menu.test.tsx`
- Reference (read, do not modify yet): `apps/frontend/web/src/shared/components/app-sidebar/sidebar-user-menu.tsx` — the source this task extracts from.

**Interfaces:**
- Consumes: `useCurrentUser`, `useSignOut` (`@/features/user/viewmodel/*`), `useActiveProvider`, `useProviderDetail`, `workspaceStatusBadgeKey`, `initialsFrom` (`@/shared/lib/initials`), `applyThemePreference` (`@/shared/lib/theme`).
- Produces:
  ```tsx
  export function WorkspaceSwitcher(): JSX.Element;            // a DropdownMenuSub — render inside ConsoleUserMenu's children
  export function MobileWorkspaceSwitcher(): JSX.Element | null; // rows for the sheet header; null with one workspace
  export function ConsoleUserMenu(props: { ns: "provider" | "admin"; children?: ReactNode }): JSX.Element;
  ```

- [ ] **Step 1: Write the failing test**

`apps/frontend/web/src/shared/components/console/console-user-menu.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SidebarProvider } from "@ntizo/frontend-ui";

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/features/user/viewmodel/use-current-user", () => ({
  useCurrentUser: () => ({ data: { name: "Ana M", email: "ana@example.com", avatarUrl: null } }),
}));
vi.mock("@/features/user/viewmodel/use-sign-out", () => ({
  useSignOut: () => async () => ({ serverRevokeFailed: false }),
}));

const { ConsoleUserMenu } = await import("./console-user-menu");

function renderMenu(children?: React.ReactNode) {
  return render(
    <SidebarProvider>
      <ConsoleUserMenu ns="provider">{children}</ConsoleUserMenu>
    </SidebarProvider>,
  );
}

describe("ConsoleUserMenu", () => {
  it("renders the signed-in name inside the sidebar trigger — the e2e sign-out helper matches on it", () => {
    renderMenu();
    const trigger = document.querySelector('[data-sidebar="menu-button"]');
    expect(trigger).toHaveTextContent("Ana M");
  });

  it("offers Sign out as a menu item", async () => {
    renderMenu();
    await userEvent.click(screen.getByText("Ana M"));
    expect(await screen.findByRole("menuitem", { name: /sign out/i })).toBeInTheDocument();
  });

  it("renders whatever the zone hands it as the workspace section, and nothing when it hands nothing", async () => {
    const { unmount } = renderMenu(<div data-testid="switcher">switcher</div>);
    await userEvent.click(screen.getByText("Ana M"));
    expect(await screen.findByTestId("switcher")).toBeInTheDocument();
    unmount();

    renderMenu();
    await userEvent.click(screen.getByText("Ana M"));
    await screen.findByRole("menuitem", { name: /sign out/i });
    expect(screen.queryByTestId("switcher")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd apps/frontend/web && bun run vitest run src/shared/components/console/console-user-menu.test.tsx`
Expected: FAIL — `Cannot find module './console-user-menu'`.

- [ ] **Step 3: Write the switcher** — the `DropdownMenuSub` block lifted verbatim from `app-sidebar/sidebar-user-menu.tsx` lines 116–197, plus a row list for the sheet

`apps/frontend/web/src/shared/components/console/workspace-switcher.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { Check, Plus } from "lucide-react";
import {
  AvatarImage,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  cn,
} from "@ntizo/frontend-ui";
import { useActiveProvider } from "@/features/provider/viewmodel/use-active-provider";
import { useProviderDetail } from "@/features/provider/viewmodel/use-providers";
import { workspaceStatusBadgeKey } from "@/features/provider/domain/workspace-status";

/**
 * Switching workspace, as a sub-menu of the account menu.
 *
 * Here rather than in a block of its own under the masthead: the account and
 * its organizations belong together, and the workspace's name is already the
 * page title. Two controls for one thing is one too many.
 */
export function WorkspaceSwitcher() {
  const { t } = useTranslation("provider");
  const { providers, activeProvider, setActive } = useActiveProvider();
  // Cached alongside the settings page's own read; costs nothing extra here.
  const { data: detail } = useProviderDetail(activeProvider?.id);
  const nav = useNavigate();
  const orgInitials = (activeProvider?.name ?? "?").slice(0, 2).toUpperCase();

  return (
    <>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="py-2">
          {/* Only the active workspace gets a logo — the rows below would
              each cost a detail fetch to find theirs. */}
          <div className="mr-2 flex aspect-square h-7 w-7 items-center justify-center overflow-hidden rounded-md bg-primary/15 text-[11px] font-semibold text-primary">
            {detail?.logo?.url ? <AvatarImage src={detail.logo.url} alt="" /> : orgInitials}
          </div>
          <div className="flex flex-1 flex-col leading-tight">
            <span className="text-sm font-medium">{activeProvider?.name ?? t("noProvider")}</span>
            <span className="text-[11px] text-muted-foreground">{activeProvider?.role ?? ""}</span>
          </div>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-64">
          {providers.map((p) => {
            const isActive = p.id === activeProvider?.id;
            // Whether the platform has approved it — the thing the slug
            // cannot say. Two workspaces with one name and two slugs told you
            // they were different; neither told you only one is live.
            const badgeKey = workspaceStatusBadgeKey(p.status);
            return (
              <DropdownMenuItem key={p.id} onSelect={() => setActive(p.id)} className="py-2">
                <div className="mr-2 flex aspect-square h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-[11px] font-semibold text-primary">
                  {p.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="truncate text-sm font-medium">{p.name}</span>
                  {/* The slug, not the role: unique by construction, and what
                      the address bar shows next. */}
                  <span className="truncate font-mono text-[11px] text-muted-foreground">{p.slug}</span>
                  {badgeKey && (
                    <span className="mt-0.5 w-fit rounded-full bg-[color-mix(in_srgb,var(--color-warning)_22%,transparent)] px-1.5 py-px text-[10px] font-medium text-[var(--color-foreground)]">
                      {t(badgeKey)}
                    </span>
                  )}
                </div>
                {isActive && <Check className="ml-2 h-4 w-4" />}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          {/* The wizard, not a dialog: a second workspace needs the same
              type, address, payout and documents as the first. */}
          <DropdownMenuItem onSelect={() => nav({ to: "/onboarding" })}>
            <Plus className="h-4 w-4" />
            {t("createNew")}
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
    </>
  );
}

/**
 * The same choice at the head of the phone's menu sheet, as plain rows. A
 * nested dropdown has no honest form under a thumb. Renders nothing when
 * there is only one workspace to be in.
 */
export function MobileWorkspaceSwitcher() {
  const { t } = useTranslation("provider");
  const { providers, activeProvider, setActive } = useActiveProvider();
  if (providers.length < 2) return null;

  return (
    <div className="mb-2 grid gap-1 border-b border-[var(--color-border)] pb-2">
      {providers.map((p) => {
        const isActive = p.id === activeProvider?.id;
        const badgeKey = workspaceStatusBadgeKey(p.status);
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => setActive(p.id)}
            aria-current={isActive ? "true" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-[var(--radius-field)] px-2 py-2 text-left",
              isActive && "bg-[var(--color-muted)]",
            )}
          >
            <span className="flex aspect-square h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-[11px] font-semibold text-primary">
              {p.name.slice(0, 2).toUpperCase()}
            </span>
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-sm font-medium">{p.name}</span>
              <span className="truncate font-mono text-[11px] text-muted-foreground">
                {p.slug}
                {badgeKey && ` · ${t(badgeKey)}`}
              </span>
            </span>
            {isActive && <Check className="h-4 w-4 shrink-0" />}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Write the menu** — `app-sidebar/sidebar-user-menu.tsx` with the switcher replaced by `children`, `initialsFrom()` instead of the inline copy, and the namespace as a prop

`apps/frontend/web/src/shared/components/console/console-user-menu.tsx`:

```tsx
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, ChevronsUpDown, LogOut, Monitor, Moon, Palette, Sun, User as UserIcon } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@ntizo/frontend-ui";
import { useCurrentUser } from "@/features/user/viewmodel/use-current-user";
import { useSignOut } from "@/features/user/viewmodel/use-sign-out";
import { initialsFrom } from "@/shared/lib/initials";
import { applyThemePreference } from "@/shared/lib/theme";

/**
 * The signed-in person's menu, at the foot of the console sidebar.
 *
 * One component for both zones. What differs between them — the workspace
 * switcher, which belongs to a business rather than a person — arrives as
 * `children` from the zone that has one, so this file never asks which zone
 * it is in. It opens to the right because the trigger is the last thing in a
 * sidebar pinned to the left edge; a menu anchored to its right edge would
 * unfold back across the sidebar and off the screen.
 *
 * Both "My account" and "Back to Ntizo" leave the zone, and that is the
 * point: an account belongs to a person, a zone belongs to an organization
 * or the platform. Keeping them here is what keeps the sidebar about the
 * business.
 */
export function ConsoleUserMenu({ ns, children }: { ns: "provider" | "admin"; children?: ReactNode }) {
  const { t } = useTranslation(ns);
  const { t: ta } = useTranslation("auth");
  const { t: tc } = useTranslation("common");
  const { data: user } = useCurrentUser();
  const nav = useNavigate();
  const signOut = useSignOut();

  async function handleSignOut() {
    const { serverRevokeFailed } = await signOut();
    if (serverRevokeFailed) toast.error(ta("signOutOffline"));
  }

  const initials = initialsFrom(user?.name ?? user?.email ?? "?");

  return (
    <SidebarFooter>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger>
              <SidebarMenuButton size="lg" tooltip={user?.name ?? user?.email ?? ""}>
                <Avatar className="h-8 w-8">
                  {user?.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={user.name ?? ""} /> : null}
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>
                {/* Gone when the rail collapses to icons: a name truncated to
                    four characters says nothing, and the tooltip carries it. */}
                <div className="grid flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                  <span className="truncate text-sm font-semibold">{user?.name ?? ""}</span>
                  <span className="truncate text-[11px] text-muted-foreground">{user?.email ?? ""}</span>
                </div>
                <ChevronsUpDown className="ml-auto size-4 opacity-60 group-data-[collapsible=icon]:hidden" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64" side="right">
              <DropdownMenuLabel className="px-3 py-3">
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    {user?.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={user.name ?? ""} /> : null}
                    <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="grid leading-tight">
                    <span className="text-sm font-semibold text-foreground">{user?.name ?? ""}</span>
                    <span className="text-[11px] font-normal text-muted-foreground">{user?.email ?? ""}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />

              {/* The workspace section, when the zone has one. First, because
                  this menu sits inside a workspace and switching is the thing
                  most often wanted here. */}
              {children}

              <DropdownMenuItem onSelect={() => nav({ to: "/account" })}>
                <UserIcon className="h-4 w-4" />
                {t("nav.myAccount")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => nav({ to: "/" })}>
                <ArrowLeft className="h-4 w-4" />
                {t("backToApp")}
              </DropdownMenuItem>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Palette className="h-4 w-4" />
                  {tc("appearance")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-44">
                  <DropdownMenuItem onSelect={() => applyThemePreference("light")}>
                    <Sun className="h-4 w-4" />
                    {tc("themeLight")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => applyThemePreference("dark")}>
                    <Moon className="h-4 w-4" />
                    {tc("themeDark")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => applyThemePreference("system")}>
                    <Monitor className="h-4 w-4" />
                    {tc("themeSystem")}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={handleSignOut} className="text-destructive focus:text-destructive">
                <LogOut className="h-4 w-4" />
                {ta("signOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
}
```

- [ ] **Step 5: Run the test**

Run: `cd apps/frontend/web && bun run vitest run src/shared/components/console/console-user-menu.test.tsx`
Expected: PASS, 3 tests. If the menu content does not appear after the click, check how `dropdown-menu.test.tsx` in `packages/frontend/src/components/__tests__/` opens it and use the same event.

- [ ] **Step 6: Commit**

```bash
cd apps/frontend/web
git add src/shared/components/console/workspace-switcher.tsx src/shared/components/console/console-user-menu.tsx src/shared/components/console/console-user-menu.test.tsx
git commit -m "feat(console): one account menu; the workspace switcher arrives from the zone that has one" \
  -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" \
  -m "Claude-Session: https://claude.ai/code/session_0137neNHJJv594fiF8cKvt5v"
```

---

### Task 4: The header and the page width

**Files:**
- Create: `apps/frontend/web/src/shared/components/console/console-header.tsx`
- Create: `apps/frontend/web/src/shared/components/console/console-page.tsx`
- Create: `apps/frontend/web/src/shared/components/console/console-page.test.tsx`

**Interfaces:**
- Consumes: `usePageHeaderValue`, `usePageHeaderAction` from `@/shared/lib/page-header`; `HeaderActions` from `@/shared/components/header-actions`.
- Produces:
  ```tsx
  export function ConsoleHeader(props: { bell: ReactNode }): JSX.Element;
  export function ConsolePage(props: { width?: "wide" | "narrow"; className?: string; children: ReactNode }): JSX.Element;
  ```

- [ ] **Step 1: Write the failing test for the page width**

`apps/frontend/web/src/shared/components/console/console-page.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ConsolePage } from "./console-page";

describe("ConsolePage", () => {
  it("is the one width by default", () => {
    const { container } = render(<ConsolePage>x</ConsolePage>);
    expect(container.firstChild).toHaveClass("max-w-6xl");
  });
  it("has one documented narrower measure, for reading-width screens", () => {
    const { container } = render(<ConsolePage width="narrow">x</ConsolePage>);
    expect(container.firstChild).toHaveClass("max-w-4xl");
    expect(container.firstChild).not.toHaveClass("max-w-6xl");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd apps/frontend/web && bun run vitest run src/shared/components/console/console-page.test.tsx`
Expected: FAIL — `Cannot find module './console-page'`.

- [ ] **Step 3: Write both components**

`apps/frontend/web/src/shared/components/console/console-page.tsx`:

```tsx
import type { ReactNode } from "react";
import { cn } from "@ntizo/frontend-ui";

/**
 * The width every console page is drawn at.
 *
 * Four different `max-w-*` values were in use across the two zones — 6xl,
 * 5xl, 4xl and none — so walking between two screens changed the measure
 * under you. One value, and one documented exception for screens that are
 * read rather than scanned: a detail body, a settings form.
 *
 * Not adopted by any page in this plan; Phase 5 moves every page onto it and
 * a lint rule keeps ad-hoc widths out afterwards.
 */
export function ConsolePage({
  width = "wide",
  className,
  children,
}: {
  width?: "wide" | "narrow";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-col gap-4",
        width === "narrow" ? "max-w-4xl" : "max-w-6xl",
        className,
      )}
    >
      {children}
    </div>
  );
}
```

`apps/frontend/web/src/shared/components/console/console-header.tsx`:

```tsx
import type { ReactNode } from "react";
import { Separator, SidebarTrigger } from "@ntizo/frontend-ui";
import { HeaderActions } from "@/shared/components/header-actions";
import { usePageHeaderAction, usePageHeaderValue } from "@/shared/lib/page-header";

/**
 * The row at the top of every console screen: where you are, and the one
 * action this page offers.
 *
 * Two things that used to be here are gone. A search field with a ⌘K badge
 * wired to nothing, and a "New service" button that was the *fallback*
 * whenever a page set no action — so it rendered on Wallet, on Activity, on
 * Settings, and did nothing anywhere. A control that lies about being one is
 * worse than no control. A page with no action now shows no button.
 *
 * The sidebar trigger hides below `md`: there is no sidebar to toggle there,
 * the tab bar and its Menu sheet are the navigation. The bell does not hide
 * on any width — Notifications has left the sidebar and has no tab, so this
 * is the only route to the inbox on a phone.
 */
export function ConsoleHeader({ bell }: { bell: ReactNode }) {
  const header = usePageHeaderValue();
  const action = usePageHeaderAction();

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border bg-background px-4 sm:px-6">
      <SidebarTrigger className="hidden md:inline-flex" />
      <Separator orientation="vertical" className="hidden h-6 md:block" />
      {/* `min-w-0` because a flex child defaults to `min-width: auto` and
          will not shrink below its own text — without it `truncate` never
          engages. */}
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-base font-semibold">{header.title}</span>
        {header.subtitle && (
          <span className="truncate text-xs text-muted-foreground">{header.subtitle}</span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <HeaderActions showAccount={false} />
        {bell}
        {action}
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Run the test, then typecheck**

Run: `cd apps/frontend/web && bun run vitest run src/shared/components/console/console-page.test.tsx && bun run typecheck`
Expected: PASS, 2 tests; typecheck clean.

- [ ] **Step 5: Commit**

```bash
cd apps/frontend/web
git add src/shared/components/console/console-header.tsx src/shared/components/console/console-page.tsx src/shared/components/console/console-page.test.tsx
git commit -m "feat(console): the header with no fallback action, and the one page width" \
  -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" \
  -m "Claude-Session: https://claude.ai/code/session_0137neNHJJv594fiF8cKvt5v"
```

---

### Task 5: The sidebar, rendered from the schema

**Files:**
- Create: `apps/frontend/web/src/shared/components/console/console-nav-items.tsx`
- Create: `apps/frontend/web/src/shared/components/console/console-sidebar.tsx`

**Interfaces:**
- Consumes: `ConsoleNav`, `resolveUrl` (Task 1); `ConsoleUserMenu` (Task 3).
- Produces:
  ```tsx
  export function ConsoleNavItems(props: { nav: ConsoleNav; slug: string | undefined }): JSX.Element;
  export function ConsoleSidebar(props: { nav: ConsoleNav; slug: string | undefined; zoneLabel: string; workspaceMenu?: ReactNode }): JSX.Element;
  ```
  Tested through the shell in Task 6 — the interesting behaviour (active state, slug substitution, zone data) needs a router and a zone.

- [ ] **Step 1: Write the nav items**

`apps/frontend/web/src/shared/components/console/console-nav-items.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@ntizo/frontend-ui";
import { resolveUrl, type ConsoleNav, type ConsoleNavItem } from "@/shared/lib/console-nav";

/**
 * The menu: home ungrouped at the top, then Work, then Manage.
 *
 * Every rendering of the console's navigation — this sidebar, the phone's
 * tab bar, the phone's menu sheet — reads the same `ConsoleNav`. This one
 * draws all of it; the other two draw subsets. None of them decides anything.
 *
 * When the rail collapses to icons the group labels vanish (a word over a
 * column of icons labels nothing) and a hairline takes their place, so the
 * grouping survives the words.
 */
export function ConsoleNavItems({ nav, slug }: { nav: ConsoleNav; slug: string | undefined }) {
  const { t } = useTranslation(nav.ns);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  function row(item: ConsoleNavItem) {
    const Icon = item.icon;
    // The template is what the router matches on; the resolved path is what
    // the current location is compared against.
    const href = resolveUrl(item.url, slug);
    const isActive = href !== null && pathname.startsWith(href);
    return (
      <SidebarMenuItem key={item.key}>
        <SidebarMenuButton asChild isActive={isActive} tooltip={t(item.titleKey)} className="relative">
          <Link to={item.url} params={{ slug: slug ?? "" }}>
            <Icon />
            <span>{t(item.titleKey)}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>{row(nav.home)}</SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarSeparator />
      <SidebarGroup>
        <SidebarGroupLabel>{t("nav.work")}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>{nav.work.map(row)}</SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {/* Only when collapsed — the label above carries the boundary when it
          is visible, and two dividers in a row read as a mistake. */}
      <SidebarSeparator className="hidden group-data-[collapsible=icon]:block" />
      <SidebarGroup>
        <SidebarGroupLabel>{t("nav.manage")}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>{nav.manage.map(row)}</SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  );
}
```

- [ ] **Step 2: Write the sidebar**

`apps/frontend/web/src/shared/components/console/console-sidebar.tsx`:

```tsx
import type { ReactNode } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarRail,
} from "@ntizo/frontend-ui";
import type { ConsoleNav } from "@/shared/lib/console-nav";
import { ConsoleNavItems } from "./console-nav-items";
import { ConsoleUserMenu } from "./console-user-menu";

/**
 * The console's sidebar: one masthead, the menu, the account at the foot.
 *
 * The masthead is the wordmark and which zone this is. No coloured tile — a
 * logo squeezed into a 20px square is a texture, not a logo. Collapsed to
 * icons the wordmark has nowhere to go, so the mark alone takes over.
 *
 * `workspaceMenu` is the zone's contribution to the account menu — the
 * switcher, for a workspace; nothing, for the platform. This component does
 * not know which it is in.
 */
export function ConsoleSidebar({
  nav,
  slug,
  zoneLabel,
  workspaceMenu,
}: {
  nav: ConsoleNav;
  slug: string | undefined;
  zoneLabel: string;
  workspaceMenu?: ReactNode;
}) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-2.5 px-2 py-2">
              <img
                src="/brand/icon-primary.svg"
                alt=""
                aria-hidden="true"
                className="hidden h-8 w-auto shrink-0 group-data-[collapsible=icon]:block"
              />
              <div className="grid gap-1 group-data-[collapsible=icon]:hidden">
                <img src="/brand/logo-primary.svg" alt="Ntizo" className="h-7 w-auto" />
                <span className="truncate text-[11px] text-[var(--color-muted-foreground)]">{zoneLabel}</span>
              </div>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <ConsoleNavItems nav={nav} slug={slug} />
      </SidebarContent>
      <ConsoleUserMenu ns={nav.ns}>{workspaceMenu}</ConsoleUserMenu>
      <SidebarRail />
    </Sidebar>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/frontend/web && bun run typecheck`
Expected: clean. (`SidebarSeparator` takes `className` — `sidebar.tsx:324`.)

- [ ] **Step 4: Commit**

```bash
cd apps/frontend/web
git add src/shared/components/console/console-nav-items.tsx src/shared/components/console/console-sidebar.tsx
git commit -m "feat(console): the sidebar draws home, Work and Manage from the schema" \
  -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" \
  -m "Claude-Session: https://claude.ai/code/session_0137neNHJJv594fiF8cKvt5v"
```

---

### Task 6: The shell, and the tests that prove it is one shell

**Files:**
- Create: `apps/frontend/web/src/shared/components/console/console-shell.tsx`
- Create: `apps/frontend/web/src/shared/components/console/console-shell.test.tsx`
- Reference: `apps/frontend/web/src/shared/components/provider-shell.test.tsx` — the two tests this ports.

**Interfaces:**
- Consumes: everything above; `useActiveProvider`, `useProviderDetail`, `formatCommission`, `NotificationBellLink`, `PageHeaderContext`/`PageHeaderState`, `applyThemePreference`/`readThemePreference`.
- Produces: `export function ConsoleShell(props: { zone: ConsoleZone; children: ReactNode }): JSX.Element`. Internally: `WorkspaceShell`, `PlatformShell`, `ShellFrame` (not exported; Task 10 edits `ShellFrame`).

- [ ] **Step 1: Write the failing test**

`apps/frontend/web/src/shared/components/console/console-shell.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";
import type { ProviderDetail, ProviderSummary } from "@/features/provider/domain/types";
import type { CurrentUserDTO } from "@/features/user/domain/current-user";
import { usePageHeader } from "@/shared/lib/page-header";
import { ConsoleShell } from "./console-shell";

/**
 * Ported from `provider-shell.test.tsx`, whose two assertions this keeps
 * word for word: the rate must be on every path, not only the one that
 * happens to pass through Overview. Added: the platform zone renders through
 * the same component with the same header and no strip; a page with no
 * action gets no button; a workspace that is not live is told so on a deep
 * link, which is the whole reason the sentence moved here from Overview.
 */

const PROVIDER: ProviderSummary = {
  id: "p1", name: "Bela Vista Studio", slug: "bela-vista",
  type: "organization", status: "active", role: "owner",
};
// Not 10% — a component that ignored the prop and rendered the schema's own
// default would still show 10% here.
const DETAIL: ProviderDetail = {
  id: PROVIDER.id, name: PROVIDER.name, slug: PROVIDER.slug,
  type: "organization", status: "active", commissionBps: 1200,
};
const USER: CurrentUserDTO = {
  id: "u1", email: "ana@example.com", role: "organization_owner", status: "active",
  createdAt: "2024-01-01T00:00:00.000Z", name: "Ana", firstName: "Ana", lastName: "M",
  displayName: "Ana", avatarUrl: null, avatarKey: null, phoneNumber: null, bio: null,
  language: "en-US", timezone: "Africa/Maputo", dateOfBirth: null, gender: null,
};
const ADMIN: CurrentUserDTO = { ...USER, id: "u2", email: "root@example.com", role: "admin", name: "Root" };

function SettingsPage() {
  usePageHeader("Workspace settings", "Bela Vista Studio");
  return <div>Settings page</div>;
}

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
}

function renderWorkspace(initialPath: string, provider: ProviderSummary | null = PROVIDER) {
  const qc = client();
  qc.setQueryData(["providers", "mine"], provider ? [provider] : []);
  qc.setQueryData(["providers", PROVIDER.id], DETAIL);
  qc.setQueryData(["user", "me"], USER);
  qc.setQueryData(["notifications", "provider", PROVIDER.id, "unread"], 0);

  const rootRoute = createRootRoute();
  const slugRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/provider/$slug",
    component: () => (
      <ConsoleShell zone="workspace">
        <Outlet />
      </ConsoleShell>
    ),
  });
  const overview = createRoute({ getParentRoute: () => slugRoute, path: "/overview", component: () => <div>Overview page</div> });
  const newService = createRoute({ getParentRoute: () => slugRoute, path: "/services/new", component: () => <div>New service page</div> });
  const settings = createRoute({ getParentRoute: () => slugRoute, path: "/settings", component: SettingsPage });
  const router = createRouter({
    routeTree: rootRoute.addChildren([slugRoute.addChildren([overview, newService, settings])]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  render(<QueryClientProvider client={qc}><RouterProvider router={router} /></QueryClientProvider>);
}

function renderPlatform(initialPath: string) {
  const qc = client();
  qc.setQueryData(["user", "me"], ADMIN);
  qc.setQueryData(["notifications", "mine", "unread"], 0);

  const rootRoute = createRootRoute();
  const adminRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/admin",
    component: () => (
      <ConsoleShell zone="platform">
        <Outlet />
      </ConsoleShell>
    ),
  });
  const dashboard = createRoute({ getParentRoute: () => adminRoute, path: "/dashboard", component: () => <div>Dashboard page</div> });
  const router = createRouter({
    routeTree: rootRoute.addChildren([adminRoute.addChildren([dashboard])]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  render(<QueryClientProvider client={qc}><RouterProvider router={router} /></QueryClientProvider>);
}

const sidebar = () => within(document.querySelector('[data-slot="sidebar"]') as HTMLElement);

afterEach(() => vi.restoreAllMocks());

describe("ConsoleShell · workspace", () => {
  it("shows the workspace's commission rate on a bookmarked deep link that never passes through Overview", async () => {
    renderWorkspace("/provider/bela-vista/services/new");
    expect(await screen.findByText("New service page")).toBeInTheDocument();
    expect(screen.getByText("12%")).toBeInTheDocument();
    expect(screen.getByText("Platform's share")).toBeInTheDocument();
  });

  it("shows the same rate on Overview too — one place to keep true, not two", async () => {
    renderWorkspace("/provider/bela-vista/overview");
    expect(await screen.findByText("Overview page")).toBeInTheDocument();
    expect(screen.getByText("12%")).toBeInTheDocument();
  });

  it("tells a workspace that is not live so, on the same deep link — the sentence is in the shell, not on Overview", async () => {
    renderWorkspace("/provider/bela-vista/services/new", { ...PROVIDER, status: "pending" });
    expect(await screen.findByText("New service page")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("This business is awaiting approval");
    expect(screen.queryByText("Platform's share")).not.toBeInTheDocument();
  });

  it("draws no strip at all when there is no workspace yet", async () => {
    renderWorkspace("/provider/bela-vista/overview", null);
    expect(await screen.findByText("Overview page")).toBeInTheDocument();
    expect(screen.queryByText("Platform's share")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("puts the page's title in the header, and no button where the page set no action", async () => {
    renderWorkspace("/provider/bela-vista/settings");
    expect(await screen.findByText("Settings page")).toBeInTheDocument();
    expect(screen.getByText("Workspace settings")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /new service/i })).not.toBeInTheDocument();
  });

  it("lists home, then Work, then Manage, with the slug filled in", async () => {
    renderWorkspace("/provider/bela-vista/overview");
    await screen.findByText("Overview page");
    const links = sidebar().getAllByRole("link").map((a) => a.textContent?.trim());
    expect(links).toEqual(["Overview", "Messages", "Availability", "Services", "Members", "Wallet", "Activity", "Settings"]);
    expect(sidebar().getByRole("link", { name: "Messages" })).toHaveAttribute("href", "/provider/bela-vista/messages");
    expect(sidebar().queryByRole("link", { name: "Notifications" })).not.toBeInTheDocument();
  });
});

describe("ConsoleShell · platform", () => {
  it("renders the platform's menu through the same shell, with no workspace strip", async () => {
    renderPlatform("/admin/dashboard");
    expect(await screen.findByText("Dashboard page")).toBeInTheDocument();
    const links = sidebar().getAllByRole("link").map((a) => a.textContent?.trim());
    expect(links).toEqual(["Dashboard", "Providers", "Reviews", "Users", "Activity", "Categories"]);
    expect(sidebar().getByText("Admin")).toBeInTheDocument();
    expect(screen.queryByText("Platform's share")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd apps/frontend/web && bun run vitest run src/shared/components/console/console-shell.test.tsx`
Expected: FAIL — `Cannot find module './console-shell'`.

- [ ] **Step 3: Write the shell**

`apps/frontend/web/src/shared/components/console/console-shell.tsx`:

```tsx
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SidebarInset, SidebarProvider } from "@ntizo/frontend-ui";
import { NotificationBellLink } from "@/shared/components/notification-bell-link";
import { useActiveProvider } from "@/features/provider/viewmodel/use-active-provider";
import { useProviderDetail } from "@/features/provider/viewmodel/use-providers";
import { formatCommission } from "@/shared/domain/commission-format";
import { consoleNav, type ConsoleNav, type ConsoleZone } from "@/shared/lib/console-nav";
import { PageHeaderContext, type PageHeaderState } from "@/shared/lib/page-header";
import { applyThemePreference, readThemePreference } from "@/shared/lib/theme";
import { ConsoleHeader } from "./console-header";
import { ConsoleSidebar } from "./console-sidebar";
import { ConsoleStrip } from "./console-strip";
import { WorkspaceSwitcher } from "./workspace-switcher";

/** The 36px bordered square the bell sits in. On every width — see ConsoleHeader. */
const BELL_CLASS =
  "relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-secondary text-foreground hover:bg-accent";

/**
 * The console: one shell for `/provider/$slug/*` and `/admin/*`.
 *
 * It replaces `ProviderShell` and `AdminShell`, which were the same header
 * and the same context written twice and had already drifted. The zone
 * decides three things — the nav data, the masthead label, and whether the
 * strip row carries workspace facts — and each zone reads only its own data:
 * `WorkspaceShell` and `PlatformShell` call different hooks and render one
 * `ShellFrame`. Nothing in the frame knows which zone it is in.
 *
 * The theme preference is re-applied here rather than forced: it is global,
 * and a zone is not the right level to have an opinion about it.
 */
export function ConsoleShell({ zone, children }: { zone: ConsoleZone; children: ReactNode }) {
  const [header, setHeader] = useState<PageHeaderState>({ title: "" });
  const [action, setAction] = useState<ReactNode>(null);
  // Stable identity so consumers don't re-render on every shell render.
  const headerCtx = useMemo(() => ({ header, setHeader, action, setAction }), [header, action]);

  useEffect(() => {
    applyThemePreference(readThemePreference());
  }, []);

  const nav = consoleNav(zone);

  return (
    <PageHeaderContext.Provider value={headerCtx}>
      {zone === "workspace" ? (
        <WorkspaceShell nav={nav}>{children}</WorkspaceShell>
      ) : (
        <PlatformShell nav={nav}>{children}</PlatformShell>
      )}
    </PageHeaderContext.Provider>
  );
}

/**
 * The workspace's data: which one is active, its slug, its commission, its
 * status. Read here, in the one component every `/provider/$slug` route
 * renders through — a bookmark straight to `/services/new` never passes
 * through Overview, and both the rate and the not-live sentence have to be
 * true on every door.
 */
function WorkspaceShell({ nav, children }: { nav: ConsoleNav; children: ReactNode }) {
  const { t, i18n } = useTranslation("provider");
  const { activeProvider } = useActiveProvider();
  const providerId = activeProvider?.id ?? "";
  const { data: detail } = useProviderDetail(activeProvider?.id);
  const commission =
    detail?.commissionBps == null
      ? null
      : formatCommission(detail.commissionBps, i18n.resolvedLanguage ?? i18n.language);

  return (
    <ShellFrame
      nav={nav}
      slug={activeProvider?.slug}
      zoneLabel={t("providerConsole")}
      bell={
        // The workspace's own inbox, not the person's. `useUnreadCount`'s
        // `enabled` guard keeps it from firing while `providerId` is "".
        <NotificationBellLink
          scope={{ kind: "provider", providerId }}
          to="/provider/$slug/notifications"
          params={{ slug: activeProvider?.slug ?? "" }}
          className={BELL_CLASS}
        />
      }
      strip={activeProvider ? <ConsoleStrip status={activeProvider.status} commission={commission} /> : null}
      workspaceMenu={<WorkspaceSwitcher />}
    >
      {children}
    </ShellFrame>
  );
}

/** The platform has no workspace: no strip, no switcher, the person's own inbox. */
function PlatformShell({ nav, children }: { nav: ConsoleNav; children: ReactNode }) {
  const { t } = useTranslation("admin");
  return (
    <ShellFrame
      nav={nav}
      slug={undefined}
      zoneLabel={t("adminConsole")}
      bell={<NotificationBellLink scope={{ kind: "mine" }} to="/account/notifications" className={BELL_CLASS} />}
      strip={null}
    >
      {children}
    </ShellFrame>
  );
}

/**
 * The frame both zones render. The inset holds the viewport; only `main`
 * scrolls — before this the whole document scrolled and the navigation slid
 * away exactly when a long page made it useful.
 */
function ShellFrame({
  nav,
  slug,
  zoneLabel,
  bell,
  strip,
  workspaceMenu,
  children,
}: {
  nav: ConsoleNav;
  slug: string | undefined;
  zoneLabel: string;
  bell: ReactNode;
  strip: ReactNode;
  workspaceMenu?: ReactNode;
  children: ReactNode;
}) {
  return (
    <SidebarProvider>
      <ConsoleSidebar nav={nav} slug={slug} zoneLabel={zoneLabel} workspaceMenu={workspaceMenu} />
      <SidebarInset className="h-svh min-h-0 overflow-hidden">
        <ConsoleHeader bell={bell} />
        {strip}
        <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
```

- [ ] **Step 4: Run the test**

Run: `cd apps/frontend/web && bun run vitest run src/shared/components/console/console-shell.test.tsx`
Expected: PASS, 7 tests.

If "Admin" is found more than once, the masthead label collides with another string; change that assertion to `sidebar().getByText("Admin", { selector: "span" })`.

- [ ] **Step 5: Commit**

```bash
cd apps/frontend/web
git add src/shared/components/console/console-shell.tsx src/shared/components/console/console-shell.test.tsx
git commit -m "feat(console): one shell for both zones; the not-live sentence rides on every route" \
  -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" \
  -m "Claude-Session: https://claude.ai/code/session_0137neNHJJv594fiF8cKvt5v"
```

---

### Task 7: Switch the routes over, and delete what they replaced

**Files:**
- Modify: `apps/frontend/web/src/routes/provider/route.tsx`
- Modify: `apps/frontend/web/src/routes/admin/route.tsx`
- Modify: `apps/frontend/web/src/features/provider/ui/overview.tsx:13,30-33`
- Modify: `apps/frontend/web/src/features/provider/services/ui/services-page.tsx:19,99`
- Modify: `docs/superpowers/plans/2026-09-02-provider-bookings-phase-1.md` (a note at its Task 8)
- Delete: `apps/frontend/web/src/shared/components/provider-shell.tsx`, `provider-shell.test.tsx`, `admin-shell.tsx`, `app-sidebar/` (4 files), `admin-sidebar/` (4 files), `shared/lib/navigation.ts`, `shared/lib/admin-navigation.ts`, `shared/lib/__tests__/navigation.test.ts`, `features/provider/ui/workspace-status-notice.tsx`, `features/provider/ui/__tests__/workspace-status-notice.test.tsx`

**Interfaces:**
- Consumes: `ConsoleShell` (Task 6).
- Produces: the app runs on the new shell; nothing imports the old files.

- [ ] **Step 1: Switch the provider route**

`apps/frontend/web/src/routes/provider/route.tsx` — replace the import and the component:

```tsx
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { authClient } from "@/shared/lib/api/auth-client";
import { resolveProviderGuard } from "./provider-guard";
import { ConsoleShell } from "@/shared/components/console/console-shell";

export const Route = createFileRoute("/provider")({
  beforeLoad: async ({ location }) => {
    const { data: session } = await authClient.getSession();
    const decision = resolveProviderGuard(session, location.pathname);
    if (decision) throw redirect({ to: decision.redirectTo, search: decision.search });
    return { session };
  },
  component: () => (
    <ConsoleShell zone="workspace">
      <Outlet />
    </ConsoleShell>
  ),
});
```

- [ ] **Step 2: Switch the admin route**

`apps/frontend/web/src/routes/admin/route.tsx` — keep the `beforeLoad` and its comments exactly as they are; change only the import and the component:

```tsx
import { ConsoleShell } from "@/shared/components/console/console-shell";
// …beforeLoad unchanged…
  component: () => (
    <ConsoleShell zone="platform">
      <Outlet />
    </ConsoleShell>
  ),
```

- [ ] **Step 3: Remove the notice from the two pages that rendered it**

In `features/provider/ui/overview.tsx`: delete line 13 (`import { WorkspaceStatusNotice } …`) and lines 30–33 (the comment and `<WorkspaceStatusNotice />`).

In `features/provider/services/ui/services-page.tsx`: delete line 19 (the import) and line 99 (`<WorkspaceStatusNotice />`).

- [ ] **Step 4: Delete the replaced files**

```bash
cd apps/frontend/web/src
git rm -q shared/components/provider-shell.tsx shared/components/provider-shell.test.tsx shared/components/admin-shell.tsx
git rm -q -r shared/components/app-sidebar shared/components/admin-sidebar
git rm -q shared/lib/navigation.ts shared/lib/admin-navigation.ts shared/lib/__tests__/navigation.test.ts
git rm -q features/provider/ui/workspace-status-notice.tsx features/provider/ui/__tests__/workspace-status-notice.test.tsx
```

- [ ] **Step 5: Prove nothing still imports them**

Run, from `apps/frontend/web/src`:
`grep -rn "provider-shell\|admin-shell\|app-sidebar\|admin-sidebar\|lib/navigation\"\|admin-navigation\|workspace-status-notice" . ; echo "exit=$?"`
Expected: no matches, `exit=1`.

- [ ] **Step 6: Point the bookings plan at the merged file**

`docs/superpowers/plans/2026-09-02-provider-bookings-phase-1.md` — insert this paragraph immediately under the `### Task 8:` heading:

```markdown
> **Superseded reference (2026-09-06):** `shared/lib/navigation.ts` and `providerNavGroups` no longer exist. The sidebar entry now goes into `shared/lib/console-nav.ts` — add `bookings` as the first item of `WORKSPACE.work` with `primary: true` and `count: "bookingRequests"`, remove `primary` from `services`, and extend `shared/lib/__tests__/console-nav.test.ts` (the "puts Messages, Calendar and Services on the provider bar" case becomes Bookings, Messages, Calendar). Also add `navShort.bookings` to all eight `provider.json` files. See `2026-09-06-console-navigation-design.md`.
```

- [ ] **Step 7: Run everything**

Run: `cd apps/frontend/web && bun run vitest run && bun run typecheck && bun run lint`
Expected: all green. The route-suite tests under `src/routes/__tests__/` exercise the shells indirectly and must still pass.

- [ ] **Step 8: Commit**

```bash
cd apps/frontend/web
git add src/routes/provider/route.tsx src/routes/admin/route.tsx src/features/provider/ui/overview.tsx src/features/provider/services/ui/services-page.tsx
git add ../../../docs/superpowers/plans/2026-09-02-provider-bookings-phase-1.md
git commit -m "feat(console): both zones run on ConsoleShell; the two shells and two sidebars are gone" \
  -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" \
  -m "Claude-Session: https://claude.ai/code/session_0137neNHJJv594fiF8cKvt5v"
```

(`git rm` in Step 4 already staged the deletions.)

**Phase 1 is complete here.** On desktop the only visible changes are the removals: no search field, no fallback "New service" button, no Notifications sidebar item, and the not-live sentence in the strip on every route.

---

## Phase 2 — The mobile menu

### Task 8: Who owns the bottom edge

**Files:**
- Create: `apps/frontend/web/src/shared/lib/console-bottom-edge.tsx`
- Create: `apps/frontend/web/src/shared/lib/__tests__/console-bottom-edge.test.tsx`
- Create: `apps/frontend/web/src/shared/components/console/console-action-bar.tsx`

**Interfaces:**
- Consumes: `StickyActionBar` from `@ntizo/frontend-ui`.
- Produces:
  ```tsx
  export function BottomEdgeProvider(props: { children: ReactNode }): JSX.Element;
  export function useBottomEdgeOwned(): boolean;      // true while at least one claimant is mounted
  export function useOwnsBottomEdge(): void;          // claim on mount, release on unmount; no-op outside the provider
  export function ConsoleActionBar(props: ComponentProps<typeof StickyActionBar>): JSX.Element;
  ```

- [ ] **Step 1: Write the failing test**

`apps/frontend/web/src/shared/lib/__tests__/console-bottom-edge.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BottomEdgeProvider, useBottomEdgeOwned, useOwnsBottomEdge } from "../console-bottom-edge";

function Probe() {
  return <span data-testid="owned">{String(useBottomEdgeOwned())}</span>;
}
function Claimant() {
  useOwnsBottomEdge();
  return null;
}

describe("the bottom edge", () => {
  it("is nobody's until something claims it", () => {
    render(<BottomEdgeProvider><Probe /></BottomEdgeProvider>);
    expect(screen.getByTestId("owned")).toHaveTextContent("false");
  });

  it("is owned while a claimant is mounted, and released when it unmounts", () => {
    const { rerender } = render(<BottomEdgeProvider><Probe /><Claimant /></BottomEdgeProvider>);
    expect(screen.getByTestId("owned")).toHaveTextContent("true");
    rerender(<BottomEdgeProvider><Probe /></BottomEdgeProvider>);
    expect(screen.getByTestId("owned")).toHaveTextContent("false");
  });

  it("stays owned while any one of two claimants remains — a counter, not a flag", () => {
    const { rerender } = render(<BottomEdgeProvider><Probe /><Claimant /><Claimant /></BottomEdgeProvider>);
    rerender(<BottomEdgeProvider><Probe /><Claimant /></BottomEdgeProvider>);
    expect(screen.getByTestId("owned")).toHaveTextContent("true");
  });

  it("is a no-op outside the provider, so a form in the customer zone can still use the same bar", () => {
    render(<><Probe /><Claimant /></>);
    expect(screen.getByTestId("owned")).toHaveTextContent("false");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd apps/frontend/web && bun run vitest run src/shared/lib/__tests__/console-bottom-edge.test.tsx`
Expected: FAIL — `Cannot find module '../console-bottom-edge'`.

- [ ] **Step 3: Write the context and the bar**

`apps/frontend/web/src/shared/lib/console-bottom-edge.tsx`:

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * Who owns the bottom edge of a phone screen.
 *
 * A tab bar creates a collision the app has not had to answer: a dirty form
 * wants a save bar there, an open thread wants a composer, a booking waiting
 * on a decision wants Accept and Decline. Stacked on the tab bar that is
 * 112px of chrome on a 390px screen and two competing primary actions. So:
 * one bar, and the task wins. The tab bar is the resting state and stands
 * down whenever something claims the edge.
 *
 * A counter, not a boolean. Two claimants on one screen — a composer and a
 * decision bar in some future detail page — must not release the edge when
 * the first of them unmounts.
 *
 * `StickyActionBar` itself stays in `@ntizo/frontend-ui` and knows nothing
 * of this: a UI-package component cannot reach a web-app context and should
 * not want to. The console wraps it once, as `ConsoleActionBar`.
 */
interface BottomEdge {
  owned: boolean;
  /** Claim the edge. Returns the release. */
  claim: () => () => void;
}

const Ctx = createContext<BottomEdge | null>(null);

export function BottomEdgeProvider({ children }: { children: ReactNode }) {
  const [claims, setClaims] = useState(0);
  const claim = useCallback(() => {
    setClaims((n) => n + 1);
    return () => setClaims((n) => n - 1);
  }, []);
  const value = useMemo(() => ({ owned: claims > 0, claim }), [claims, claim]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBottomEdgeOwned(): boolean {
  return useContext(Ctx)?.owned ?? false;
}

/** Call from anything that puts its own bar at the bottom of the screen. */
export function useOwnsBottomEdge(): void {
  const claim = useContext(Ctx)?.claim;
  useEffect(() => {
    if (!claim) return;
    return claim();
  }, [claim]);
}
```

`apps/frontend/web/src/shared/components/console/console-action-bar.tsx`:

```tsx
import type { ComponentProps } from "react";
import { StickyActionBar } from "@ntizo/frontend-ui";
import { useOwnsBottomEdge } from "@/shared/lib/console-bottom-edge";

/**
 * `StickyActionBar`, and a claim on the bottom edge while it is mounted so
 * the tab bar stands down. Every console form's bottom bar is this one
 * (Phase 5 moves them over); nothing in the console renders
 * `StickyActionBar` directly.
 */
export function ConsoleActionBar(props: ComponentProps<typeof StickyActionBar>) {
  useOwnsBottomEdge();
  return <StickyActionBar {...props} />;
}
```

- [ ] **Step 4: Run the test**

Run: `cd apps/frontend/web && bun run vitest run src/shared/lib/__tests__/console-bottom-edge.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
cd apps/frontend/web
git add src/shared/lib/console-bottom-edge.tsx src/shared/lib/__tests__/console-bottom-edge.test.tsx src/shared/components/console/console-action-bar.tsx
git commit -m "feat(console): the task owns the bottom edge of a phone, never two bars" \
  -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" \
  -m "Claude-Session: https://claude.ai/code/session_0137neNHJJv594fiF8cKvt5v"
```

---

### Task 9: The sheet's open state, and where the badge numbers come from

**Files:**
- Create: `apps/frontend/web/src/shared/components/console/console-menu-context.tsx`
- Create: `apps/frontend/web/src/shared/components/console/console-counts.tsx`
- Create: `apps/frontend/web/src/shared/components/console/console-counts.test.tsx`
- Create: `apps/frontend/web/src/shared/hooks/use-is-tablet.ts`

**Interfaces:**
- Consumes: `useProviderThreads(providerId: string): { threads: Thread[]; … }` from `@/features/messaging/viewmodel/use-provider-threads`; `useAdminProviders(filters: { search?: string; status?: string })` from `@/features/admin/providers/viewmodel/use-admin-providers`; `ProviderStatus` from `@ntizo/shared`; `ConsoleCountSource`, `ConsoleZone` (Task 1).
- Produces:
  ```tsx
  export function ConsoleMenuProvider(props: { children: ReactNode }): JSX.Element;
  export function useConsoleMenu(): { open: boolean; setOpen: (v: boolean) => void };
  export type ConsoleCounts = Partial<Record<ConsoleCountSource, number>>;
  export function ConsoleCountsProvider(props: { zone: ConsoleZone; providerId?: string; children: ReactNode }): JSX.Element;
  export function useConsoleCounts(): ConsoleCounts;
  export function useIsTablet(): boolean;
  ```

- [ ] **Step 1: Write the failing counts test**

`apps/frontend/web/src/shared/components/console/console-counts.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const threads = vi.fn();
const adminProviders = vi.fn();
vi.mock("@/features/messaging/viewmodel/use-provider-threads", () => ({
  useProviderThreads: (id: string) => threads(id),
}));
vi.mock("@/features/admin/providers/viewmodel/use-admin-providers", () => ({
  useAdminProviders: (f: unknown) => adminProviders(f),
}));

const { ConsoleCountsProvider, useConsoleCounts } = await import("./console-counts");

function Probe() {
  return <pre data-testid="counts">{JSON.stringify(useConsoleCounts())}</pre>;
}

describe("ConsoleCountsProvider", () => {
  it("counts the loaded threads with something unread, for the workspace", () => {
    threads.mockReturnValue({ threads: [{ unreadCount: 2 }, { unreadCount: 0 }, { unreadCount: 1 }] });
    render(<ConsoleCountsProvider zone="workspace" providerId="p1"><Probe /></ConsoleCountsProvider>);
    expect(screen.getByTestId("counts")).toHaveTextContent('{"unreadThreads":2}');
    expect(threads).toHaveBeenCalledWith("p1");
  });

  it("asks for nothing while the workspace is still resolving", () => {
    threads.mockClear();
    render(<ConsoleCountsProvider zone="workspace" providerId=""><Probe /></ConsoleCountsProvider>);
    expect(screen.getByTestId("counts")).toHaveTextContent("{}");
    expect(threads).not.toHaveBeenCalled();
  });

  it("counts the pending applications, for the platform", () => {
    adminProviders.mockReturnValue({ data: [{ id: "a" }, { id: "b" }, { id: "c" }] });
    render(<ConsoleCountsProvider zone="platform"><Probe /></ConsoleCountsProvider>);
    expect(screen.getByTestId("counts")).toHaveTextContent('{"pendingProviders":3}');
    expect(adminProviders).toHaveBeenCalledWith({ status: "pending" });
  });

  it("reports nothing for the platform while the list is loading", () => {
    adminProviders.mockReturnValue({ data: undefined });
    render(<ConsoleCountsProvider zone="platform"><Probe /></ConsoleCountsProvider>);
    expect(screen.getByTestId("counts")).toHaveTextContent("{}");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd apps/frontend/web && bun run vitest run src/shared/components/console/console-counts.test.tsx`
Expected: FAIL — `Cannot find module './console-counts'`.

- [ ] **Step 3: Write the three files**

`apps/frontend/web/src/shared/components/console/console-menu-context.tsx`:

```tsx
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * Whether the phone's menu sheet is open. Lifted out of the sheet because
 * the thing that opens it — the Menu tab — is a different component in a
 * different part of the frame.
 */
interface ConsoleMenu {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const Ctx = createContext<ConsoleMenu | null>(null);

export function ConsoleMenuProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ open, setOpen }), [open]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useConsoleMenu(): ConsoleMenu {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useConsoleMenu must be used inside ConsoleMenuProvider.");
  return ctx;
}
```

`apps/frontend/web/src/shared/components/console/console-counts.tsx`:

```tsx
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { ProviderStatus } from "@ntizo/shared";
import { useAdminProviders } from "@/features/admin/providers/viewmodel/use-admin-providers";
import { useProviderThreads } from "@/features/messaging/viewmodel/use-provider-threads";
import type { ConsoleCountSource, ConsoleZone } from "@/shared/lib/console-nav";

/**
 * The numbers behind the badges, keyed by the source a nav item names.
 *
 * A nav item declares that it carries a count; it never fetches one. This
 * resolves each declared source against a read the zone already has in
 * scope, so the sidebar, the tab bar and the sheet all show the same number
 * from the same cache entry the page itself uses.
 *
 * Sources with no read behind them yet are simply absent: `bookingRequests`
 * until the bookings plan lands its stats read, `flaggedReviews` until the
 * reviews read exposes a pending count. An absent source draws no badge.
 *
 * Branched at the component level, not with conditional hooks: each zone
 * mounts only its own reads, and the workspace mounts nothing until it knows
 * which workspace it is.
 */
export type ConsoleCounts = Partial<Record<ConsoleCountSource, number>>;

const EMPTY: ConsoleCounts = {};
const Ctx = createContext<ConsoleCounts>(EMPTY);

export function useConsoleCounts(): ConsoleCounts {
  return useContext(Ctx);
}

export function ConsoleCountsProvider({
  zone,
  providerId,
  children,
}: {
  zone: ConsoleZone;
  providerId?: string;
  children: ReactNode;
}) {
  if (zone === "platform") return <PlatformCounts>{children}</PlatformCounts>;
  if (!providerId) return <Ctx.Provider value={EMPTY}>{children}</Ctx.Provider>;
  return <WorkspaceCounts providerId={providerId}>{children}</WorkspaceCounts>;
}

function WorkspaceCounts({ providerId, children }: { providerId: string; children: ReactNode }) {
  const { threads } = useProviderThreads(providerId);
  // Threads with something unread, among the pages loaded so far. The inbox
  // read is paginated and exposes no total, so this is an honest floor
  // rather than a count of everything — the same number the Messages page's
  // first screen shows, from the same cache entry.
  const unreadThreads = threads.filter((thread) => thread.unreadCount > 0).length;
  const value = useMemo<ConsoleCounts>(() => ({ unreadThreads }), [unreadThreads]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function PlatformCounts({ children }: { children: ReactNode }) {
  const pending = useAdminProviders({ status: ProviderStatus.Pending });
  const pendingProviders = pending.data?.length;
  const value = useMemo<ConsoleCounts>(
    () => (pendingProviders === undefined ? EMPTY : { pendingProviders }),
    [pendingProviders],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
```

`apps/frontend/web/src/shared/hooks/use-is-tablet.ts`:

```ts
import { useEffect, useState } from "react";

const QUERY = "(min-width: 768px) and (max-width: 1023px)";

/**
 * The range between the console's two breakpoints, where the sidebar is
 * present but collapses to its icon rail by default. `useIsMobile` in the UI
 * package answers "below md"; this answers "between md and lg", and nothing
 * else in the console asks a third question.
 */
export function useIsTablet(): boolean {
  const [isTablet, setIsTablet] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(QUERY);
    const onChange = () => setIsTablet(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isTablet;
}
```

- [ ] **Step 4: Run the test, then typecheck**

Run: `cd apps/frontend/web && bun run vitest run src/shared/components/console/console-counts.test.tsx && bun run typecheck`
Expected: PASS, 4 tests; typecheck clean. (`useAdminProviders` takes `{ status?: string; search?: string }` — `use-admin-providers.ts:10` — so the enum's string value assigns directly.)

- [ ] **Step 5: Commit**

```bash
cd apps/frontend/web
git add src/shared/components/console/console-menu-context.tsx src/shared/components/console/console-counts.tsx src/shared/components/console/console-counts.test.tsx src/shared/hooks/use-is-tablet.ts
git commit -m "feat(console): the sheet's open state, and the badges' numbers from reads the zone already has" \
  -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" \
  -m "Claude-Session: https://claude.ai/code/session_0137neNHJJv594fiF8cKvt5v"
```

---

### Task 10: The tab bar, the sheet, and the badges — wired into the frame

**Files:**
- Create: `apps/frontend/web/src/shared/components/console/console-tab-bar.tsx`
- Create: `apps/frontend/web/src/shared/components/console/console-menu-sheet.tsx`
- Create: `apps/frontend/web/src/shared/components/console/console-mobile.test.tsx`
- Modify: `apps/frontend/web/src/shared/components/console/console-shell.tsx` (providers around the zones; `ShellFrame` gains the bar and the sheet; `SidebarProvider` gets `defaultOpen`)
- Modify: `apps/frontend/web/src/shared/components/console/console-nav-items.tsx` (badges)

**Interfaces:**
- Consumes: Tasks 1, 3, 8, 9.
- Produces:
  ```tsx
  export const CONSOLE_MENU_TRIGGER_ID = "console-menu-trigger";
  export const CONSOLE_MENU_SHEET_ID = "console-menu-sheet";
  export function ConsoleTabBar(props: { nav: ConsoleNav; slug: string | undefined }): JSX.Element | null;
  export function ConsoleMenuSheet(props: { nav: ConsoleNav; slug: string | undefined; zoneLabel: string; header?: ReactNode }): JSX.Element;
  ```

- [ ] **Step 1: Write the failing test**

`apps/frontend/web/src/shared/components/console/console-mobile.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";
import type { ProviderDetail, ProviderSummary } from "@/features/provider/domain/types";
import type { CurrentUserDTO } from "@/features/user/domain/current-user";

// Two threads with something unread → the Messages tab wears a "2".
vi.mock("@/features/messaging/viewmodel/use-provider-threads", () => ({
  useProviderThreads: () => ({
    threads: [{ unreadCount: 3 }, { unreadCount: 0 }, { unreadCount: 1 }],
    loading: false, hasMore: false, loadMore: () => {}, errorCode: null,
  }),
}));

const { ConsoleShell } = await import("./console-shell");
const { ConsoleActionBar } = await import("./console-action-bar");

/**
 * jsdom applies no CSS, so the tab bar and the sidebar are both in the DOM
 * at every width. These tests are about behaviour — what the bar holds, how
 * the sheet opens and closes, who owns the bottom edge — and never about
 * which of the two is visible. The e2e `@mobile` project covers that.
 */

const PROVIDER: ProviderSummary = {
  id: "p1", name: "Bela Vista Studio", slug: "bela-vista",
  type: "organization", status: "active", role: "owner",
};
const DETAIL: ProviderDetail = { ...PROVIDER, commissionBps: 1200 };
const USER: CurrentUserDTO = {
  id: "u1", email: "ana@example.com", role: "organization_owner", status: "active",
  createdAt: "2024-01-01T00:00:00.000Z", name: "Ana", firstName: "Ana", lastName: "M",
  displayName: "Ana", avatarUrl: null, avatarKey: null, phoneNumber: null, bio: null,
  language: "en-US", timezone: "Africa/Maputo", dateOfBirth: null, gender: null,
};

function DecidePage() {
  return (
    <ConsoleActionBar lead="One decision">
      <button type="button">Accept</button>
    </ConsoleActionBar>
  );
}

function renderAt(initialPath: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(["providers", "mine"], [PROVIDER]);
  qc.setQueryData(["providers", PROVIDER.id], DETAIL);
  qc.setQueryData(["user", "me"], USER);
  qc.setQueryData(["notifications", "provider", PROVIDER.id, "unread"], 0);

  const rootRoute = createRootRoute();
  const slugRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/provider/$slug",
    component: () => <ConsoleShell zone="workspace"><Outlet /></ConsoleShell>,
  });
  const services = createRoute({ getParentRoute: () => slugRoute, path: "/services", component: () => <div>Services page</div> });
  const settings = createRoute({ getParentRoute: () => slugRoute, path: "/settings", component: () => <div>Settings page</div> });
  const decide = createRoute({ getParentRoute: () => slugRoute, path: "/decide", component: DecidePage });
  const router = createRouter({
    routeTree: rootRoute.addChildren([slugRoute.addChildren([services, settings, decide])]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  render(<QueryClientProvider client={qc}><RouterProvider router={router} /></QueryClientProvider>);
}

const bar = () => screen.getByRole("navigation", { name: "Main navigation" });

afterEach(() => vi.restoreAllMocks());

describe("the tab bar", () => {
  it("carries the three primary items and Menu, with a count on Messages", async () => {
    renderAt("/provider/bela-vista/services");
    await screen.findByText("Services page");
    const tabs = within(bar());
    expect(tabs.getByRole("link", { name: /messages/i })).toHaveAttribute("href", "/provider/bela-vista/messages");
    expect(tabs.getByRole("link", { name: /calendar/i })).toBeInTheDocument();
    expect(tabs.getByRole("link", { name: /services/i })).toBeInTheDocument();
    expect(tabs.getByRole("button", { name: /menu/i })).toHaveAttribute("aria-expanded", "false");
    expect(tabs.getByRole("link", { name: /messages/i })).toHaveTextContent("2");
  });

  it("stands down while a screen owns the bottom edge", async () => {
    renderAt("/provider/bela-vista/decide");
    await screen.findByRole("button", { name: "Accept" });
    expect(screen.queryByRole("navigation", { name: "Main navigation" })).not.toBeInTheDocument();
  });
});

describe("the menu sheet", () => {
  it("opens from the Menu tab with the whole menu, focuses its first item, and closes on Escape back to the tab", async () => {
    renderAt("/provider/bela-vista/services");
    await screen.findByText("Services page");
    const menu = within(bar()).getByRole("button", { name: /menu/i });

    fireEvent.click(menu);
    const sheet = await screen.findByRole("dialog", { name: /menu/i });
    expect(menu).toHaveAttribute("aria-expanded", "true");
    const links = within(sheet).getAllByRole("link").map((a) => a.textContent?.trim());
    expect(links).toEqual(["Overview", "Messages", "Availability", "Services", "Members", "Wallet", "Activity", "Settings"]);
    expect(document.activeElement).toBe(within(sheet).getByRole("link", { name: "Overview" }));

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: /menu/i })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(menu);
  });

  it("closes when a destination is picked", async () => {
    renderAt("/provider/bela-vista/services");
    await screen.findByText("Services page");
    fireEvent.click(within(bar()).getByRole("button", { name: /menu/i }));
    const sheet = await screen.findByRole("dialog", { name: /menu/i });

    fireEvent.click(within(sheet).getByRole("link", { name: "Settings" }));
    expect(await screen.findByText("Settings page")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /menu/i })).not.toBeInTheDocument();
  });

  it("closes on the backdrop", async () => {
    renderAt("/provider/bela-vista/services");
    await screen.findByText("Services page");
    fireEvent.click(within(bar()).getByRole("button", { name: /menu/i }));
    await screen.findByRole("dialog", { name: /menu/i });
    fireEvent.click(document.querySelector(".fixed.inset-0") as HTMLElement);
    expect(screen.queryByRole("dialog", { name: /menu/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd apps/frontend/web && bun run vitest run src/shared/components/console/console-mobile.test.tsx`
Expected: FAIL — no navigation named "Main navigation" is rendered.

- [ ] **Step 3: Write the tab bar**

`apps/frontend/web/src/shared/components/console/console-tab-bar.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { primaryItems, type ConsoleNav } from "@/shared/lib/console-nav";
import { useBottomEdgeOwned } from "@/shared/lib/console-bottom-edge";
import { useConsoleCounts } from "./console-counts";
import { useConsoleMenu } from "./console-menu-context";

export const CONSOLE_MENU_TRIGGER_ID = "console-menu-trigger";
export const CONSOLE_MENU_SHEET_ID = "console-menu-sheet";

const TAB =
  "flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium text-[var(--color-muted-foreground)]";
const BADGE =
  "absolute -top-1 left-1/2 ml-1 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--color-destructive)] px-1 text-[9px] font-bold leading-none text-white";

/**
 * The phone's navigation: the three items marked `primary`, and Menu.
 *
 * Below `md` only — from `md` the sidebar carries the same items. The three
 * are the ones that arrive with a count, trimmed to what a phone is good
 * for; editing a service is a seven-step wizard with image cropping, a desk
 * job, and it lives in the sheet.
 *
 * Renders nothing while a screen owns the bottom edge — a save bar, a
 * composer, a decision. One bar, and the task wins.
 *
 * In flow at the foot of the inset, not fixed over `main`: the inset is
 * already a fixed-height column in which only `main` scrolls, so the bar
 * takes its own room and the last card in a list can never end up under it.
 * `pb-[env(safe-area-inset-bottom)]` keeps it clear of the home indicator.
 */
export function ConsoleTabBar({ nav, slug }: { nav: ConsoleNav; slug: string | undefined }) {
  const { t } = useTranslation(nav.ns);
  const { t: tc } = useTranslation("common");
  const counts = useConsoleCounts();
  const { open, setOpen } = useConsoleMenu();
  const owned = useBottomEdgeOwned();
  if (owned) return null;

  return (
    <nav
      aria-label={tc("mainNavigation")}
      className="flex shrink-0 border-t border-sidebar-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {primaryItems(nav).map((item) => {
        const Icon = item.icon;
        const count = item.count ? counts[item.count] : undefined;
        return (
          <Link
            key={item.key}
            to={item.url}
            params={{ slug: slug ?? "" }}
            className={TAB}
            activeProps={{ className: "text-[var(--color-primary)]" }}
          >
            <span className="relative">
              <Icon className="h-5 w-5" aria-hidden="true" />
              {count ? <span className={BADGE}>{count}</span> : null}
            </span>
            {t(item.shortKey ?? item.titleKey)}
          </Link>
        );
      })}
      <button
        id={CONSOLE_MENU_TRIGGER_ID}
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls={CONSOLE_MENU_SHEET_ID}
        className={TAB}
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
        {tc("menu")}
      </button>
    </nav>
  );
}
```

- [ ] **Step 4: Write the sheet**

`apps/frontend/web/src/shared/components/console/console-menu-sheet.tsx`:

```tsx
import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, LogOut, User as UserIcon } from "lucide-react";
import { Button, Sheet, SheetContent, cn } from "@ntizo/frontend-ui";
import { useSignOut } from "@/features/user/viewmodel/use-sign-out";
import { useConsoleCounts } from "./console-counts";
import { useConsoleMenu } from "./console-menu-context";
import { CONSOLE_MENU_SHEET_ID, CONSOLE_MENU_TRIGGER_ID } from "./console-tab-bar";
import type { ConsoleNav, ConsoleNavItem } from "@/shared/lib/console-nav";

const ITEM =
  "flex items-center gap-2.5 rounded-[var(--radius-field)] px-2.5 py-2.5 text-[15px] font-medium text-[var(--color-foreground)]";
const ITEM_ACTIVE = "bg-[var(--color-muted)] text-[var(--color-primary)]";
const GROUP = "px-2.5 pt-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]";
const FOCUSABLE = 'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Keep Tab inside the sheet while it is open. */
function trapTab(e: KeyboardEvent, container: HTMLElement) {
  const nodes = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
  if (nodes.length === 0) return;
  const first = nodes[0]!;
  const last = nodes[nodes.length - 1]!;
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

/**
 * The sidebar, as a bottom sheet.
 *
 * Same groups, same order, same icons, same badges — read from the same
 * `ConsoleNav` the sidebar reads. One description, three renderings. It
 * reuses `Sheet` from the UI package, which already wrapped the old
 * left-hand drawer: a change of side and content, not a new primitive.
 *
 * Closes on the backdrop, on Escape, and on navigating; traps focus while
 * open and hands it back to the Menu tab on close. The account actions are
 * at its foot because the sidebar's account menu is not reachable on a phone.
 */
export function ConsoleMenuSheet({
  nav,
  slug,
  zoneLabel,
  header,
}: {
  nav: ConsoleNav;
  slug: string | undefined;
  zoneLabel: string;
  /** The zone's own head for the sheet — the workspace switcher. */
  header?: ReactNode;
}) {
  const { t } = useTranslation(nav.ns);
  const { t: tc } = useTranslation("common");
  const { t: ta } = useTranslation("auth");
  const { open, setOpen } = useConsoleMenu();
  const counts = useConsoleCounts();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const signOut = useSignOut();
  const panelRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLAnchorElement>(null);

  // Closes on navigate — the destination was the point of opening it.
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    setOpen(false);
  }, [pathname, setOpen]);

  // Focus in on open; Escape and Tab while open; focus back out on close.
  useEffect(() => {
    if (!open) return;
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      else if (e.key === "Tab" && panelRef.current) trapTab(e, panelRef.current);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.getElementById(CONSOLE_MENU_TRIGGER_ID)?.focus();
    };
  }, [open, setOpen]);

  async function handleSignOut() {
    const { serverRevokeFailed } = await signOut();
    if (serverRevokeFailed) toast.error(ta("signOutOffline"));
  }

  function item(entry: ConsoleNavItem, first = false) {
    const Icon = entry.icon;
    const count = entry.count ? counts[entry.count] : undefined;
    return (
      <Link
        key={entry.key}
        ref={first ? firstRef : undefined}
        to={entry.url}
        params={{ slug: slug ?? "" }}
        className={ITEM}
        activeProps={{ className: cn(ITEM, ITEM_ACTIVE) }}
      >
        <Icon className="h-[18px] w-[18px] text-[var(--color-muted-foreground)]" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{t(entry.titleKey)}</span>
        {count ? (
          <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[var(--color-primary)] px-1.5 text-[10.5px] font-bold text-[var(--color-primary-foreground)]">
            {count}
          </span>
        ) : null}
      </Link>
    );
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="bottom"
        className="max-h-[84svh] overflow-y-auto rounded-t-2xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:hidden"
      >
        <div ref={panelRef} id={CONSOLE_MENU_SHEET_ID} role="dialog" aria-modal="true" aria-label={tc("menu")}>
          <div aria-hidden="true" className="mx-auto mb-3 h-1 w-9 rounded-full bg-[var(--color-border)]" />
          {header ?? <p className="px-2.5 pb-2 text-xs text-[var(--color-muted-foreground)]">{zoneLabel}</p>}

          {item(nav.home, true)}
          <p className={GROUP}>{t("nav.work")}</p>
          <div className="grid grid-cols-2 gap-x-2">{nav.work.map((entry) => item(entry))}</div>
          <p className={GROUP}>{t("nav.manage")}</p>
          <div className="grid grid-cols-2 gap-x-2">{nav.manage.map((entry) => item(entry))}</div>

          <div className="mt-3 flex gap-2 border-t border-[var(--color-border)] pt-3">
            <Button type="button" variant="outline" className="flex-1" onClick={() => navigate({ to: "/account" })}>
              <UserIcon className="h-4 w-4" />
              {t("nav.myAccount")}
            </Button>
            <Button type="button" variant="outline" className="flex-1" onClick={() => navigate({ to: "/" })}>
              <ArrowLeft className="h-4 w-4" />
              {t("backToApp")}
            </Button>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="mt-2 w-full text-[var(--color-destructive)]"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" />
            {ta("signOut")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

(`Link` is a `forwardRef` component in the installed `@tanstack/react-router`, so `ref={firstRef}` lands on the anchor.)

- [ ] **Step 5: Give the sidebar its badges**

In `console-nav-items.tsx`, add the import and read the counts:

```tsx
import { useConsoleCounts } from "./console-counts";
// inside ConsoleNavItems:
const counts = useConsoleCounts();
```

and inside `row()`, after `<span>{t(item.titleKey)}</span>`:

```tsx
{item.count && counts[item.count] ? (
  // A number beside the label; a dot when the rail collapses to icons, where
  // two digits in 48px are unreadable and a wrong number is worse than none.
  // The tooltip carries the label; the dot says only that something waits.
  <span
    className={cn(
      "ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-[var(--color-primary)] px-1.5 text-[10px] font-semibold text-[var(--color-primary-foreground)]",
      "group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:right-1 group-data-[collapsible=icon]:top-1",
      "group-data-[collapsible=icon]:h-2 group-data-[collapsible=icon]:w-2 group-data-[collapsible=icon]:min-w-0",
      "group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:text-[0px]",
    )}
  >
    {counts[item.count]}
  </span>
) : null}
```

(add `cn` to the `@ntizo/frontend-ui` import.)

- [ ] **Step 6: Wire the frame**

In `console-shell.tsx`:

Add imports:

```tsx
import { BottomEdgeProvider } from "@/shared/lib/console-bottom-edge";
import { useIsTablet } from "@/shared/hooks/use-is-tablet";
import { ConsoleCountsProvider } from "./console-counts";
import { ConsoleMenuProvider } from "./console-menu-context";
import { ConsoleMenuSheet } from "./console-menu-sheet";
import { ConsoleTabBar } from "./console-tab-bar";
import { MobileWorkspaceSwitcher, WorkspaceSwitcher } from "./workspace-switcher";
```

(and drop the old `WorkspaceSwitcher`-only import.)

In `ConsoleShell`, wrap the zone branch:

```tsx
<PageHeaderContext.Provider value={headerCtx}>
  <BottomEdgeProvider>
    <ConsoleMenuProvider>
      {zone === "workspace" ? (
        <WorkspaceShell nav={nav}>{children}</WorkspaceShell>
      ) : (
        <PlatformShell nav={nav}>{children}</PlatformShell>
      )}
    </ConsoleMenuProvider>
  </BottomEdgeProvider>
</PageHeaderContext.Provider>
```

In `WorkspaceShell`, wrap `ShellFrame` and pass the sheet header:

```tsx
<ConsoleCountsProvider zone="workspace" providerId={providerId}>
  <ShellFrame
    …existing props…
    sheetHeader={<MobileWorkspaceSwitcher />}
  >
    {children}
  </ShellFrame>
</ConsoleCountsProvider>
```

In `PlatformShell`, wrap `ShellFrame` in `<ConsoleCountsProvider zone="platform">…</ConsoleCountsProvider>`.

`ShellFrame` gains `sheetHeader?: ReactNode`, the tablet default, and the two new children:

```tsx
function ShellFrame({ nav, slug, zoneLabel, bell, strip, workspaceMenu, sheetHeader, children }: {
  nav: ConsoleNav; slug: string | undefined; zoneLabel: string; bell: ReactNode; strip: ReactNode;
  workspaceMenu?: ReactNode; sheetHeader?: ReactNode; children: ReactNode;
}) {
  // Between md and lg the sidebar starts as its icon rail; the person can
  // still expand it, and that choice survives — `defaultOpen` is read once.
  const isTablet = useIsTablet();
  return (
    <SidebarProvider defaultOpen={!isTablet}>
      <ConsoleSidebar nav={nav} slug={slug} zoneLabel={zoneLabel} workspaceMenu={workspaceMenu} />
      <SidebarInset className="h-svh min-h-0 overflow-hidden">
        <ConsoleHeader bell={bell} />
        {strip}
        <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
        <ConsoleTabBar nav={nav} slug={slug} />
        <ConsoleMenuSheet nav={nav} slug={slug} zoneLabel={zoneLabel} header={sheetHeader} />
      </SidebarInset>
    </SidebarProvider>
  );
}
```

- [ ] **Step 7: Run the mobile test, then every console test**

Run: `cd apps/frontend/web && bun run vitest run src/shared/components/console src/shared/lib/__tests__`
Expected: all PASS. `console-shell.test.tsx` still passes: its sidebar assertions are scoped to `[data-slot="sidebar"]`, so the sheet's duplicate links do not reach them.

- [ ] **Step 8: Typecheck and lint**

Run: `cd apps/frontend/web && bun run typecheck && bun run lint`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
cd apps/frontend/web
git add src/shared/components/console/console-tab-bar.tsx src/shared/components/console/console-menu-sheet.tsx src/shared/components/console/console-mobile.test.tsx src/shared/components/console/console-shell.tsx src/shared/components/console/console-nav-items.tsx
git commit -m "feat(console): four tabs under the thumb, the whole menu one tap above them" \
  -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" \
  -m "Claude-Session: https://claude.ai/code/session_0137neNHJJv594fiF8cKvt5v"
```

---

### Task 11: A phone in the e2e harness

**Files:**
- Modify: `apps/e2e/playwright.config.ts:73-88`
- Create: `apps/e2e/tests/console-mobile.spec.ts`

**Interfaces:**
- Consumes: `createVerifiedUser()`, `createProvider({ name, slug, ownerUserId })`, `fillSignInForm(page, user)` from `apps/e2e/fixtures/*`.
- Produces: a `mobile` Playwright project that runs only `@mobile`-tagged tests on a phone viewport; the `chromium` project excludes them.

- [ ] **Step 1: Add the project**

In `apps/e2e/playwright.config.ts`, change the `chromium` project's `grepInvert` and add a third project after `build`:

```ts
  projects: [
    {
      name: "chromium",
      grepInvert: [BUILD_TEST_TITLE, /@mobile/],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "build",
      grep: BUILD_TEST_TITLE,
      dependencies: ["chromium"],
      fullyParallel: false,
      workers: 1,
      retries: 0,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // A phone, in Chromium — the only browser the harness installs. Tests
      // opt in with "@mobile" in their title; everything else stays on the
      // desktop project so a viewport-sensitive assertion is never run twice.
      name: "mobile",
      grep: /@mobile/,
      use: { ...devices["Pixel 5"] },
    },
  ],
```

- [ ] **Step 2: Write the spec**

`apps/e2e/tests/console-mobile.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { createVerifiedUser } from "../fixtures/auth";
import { createProvider } from "../fixtures/provider";
import { fillSignInForm } from "../fixtures/ui";

// What the unit tests cannot say, because jsdom applies no CSS: that on a
// phone the bar is the thing you see and the hamburger is not.
test("@mobile the console carries its navigation in a bottom bar and a menu sheet", async ({ page }) => {
  const owner = await createVerifiedUser();
  const slug = `mobile-${crypto.randomUUID().slice(0, 8)}`;
  await createProvider({ name: "Mobile Console Co", slug, ownerUserId: owner.id });

  await page.goto("/sign-in");
  await fillSignInForm(page, owner);
  await page.waitForURL(/\/provider\//);

  await page.goto(`/provider/${slug}/services`);
  const bar = page.getByRole("navigation", { name: "Main navigation" });
  await expect(bar).toBeVisible();
  await expect(bar.getByRole("link", { name: "Messages" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Toggle Sidebar" })).toBeHidden();

  await bar.getByRole("button", { name: "Menu" }).click();
  const sheet = page.getByRole("dialog", { name: "Menu" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("link", { name: "Settings" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(bar.getByRole("button", { name: "Menu" })).toBeFocused();
});
```

- [ ] **Step 3: Run the harness**

Run, from the repo root: `bun run e2e`
Expected: the new test passes on the `mobile` project and is skipped on `chromium`; every existing test still passes (`auth.spec.ts` drives the sidebar's user menu on desktop and depends on `ConsoleUserMenu` keeping the user's name in a `SidebarMenuButton` — Task 3's first test guards that).

- [ ] **Step 4: Commit**

```bash
git add apps/e2e/playwright.config.ts apps/e2e/tests/console-mobile.spec.ts
git commit -m "test(e2e): a phone project, and the console's bar and sheet on it" \
  -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" \
  -m "Claude-Session: https://claude.ai/code/session_0137neNHJJv594fiF8cKvt5v"
```

---

### Task 12: Verify the release, and record what it leaves for later

**Files:**
- Modify: `docs/superpowers/follow-ups.md` (append)

- [ ] **Step 1: The whole suite, once more, from clean**

Run: `cd apps/frontend/web && bun run vitest run && bun run typecheck && bun run lint`
Then, from the root: `bun run e2e`
Expected: all green.

- [ ] **Step 2: A manual pass, on the dev server**

Run `cd apps/frontend/web && bun run dev`, open `http://localhost:3000/provider` signed in as a provider, and check at 390px, 800px and 1280px wide:

- 390px: no hamburger; a bar with Messages · Calendar · Services · Menu; Menu opens the sheet from the bottom; the bell is visible in the header; the strip shows the commission (or the not-live sentence for a pending workspace).
- 800px: the sidebar is present and collapsed to its icon rail; hovering an icon shows its tooltip; the Messages icon wears a dot when a thread is unread; no bar.
- 1280px: the sidebar is expanded with Work and Manage labels; no bar; no search field; no "New service" button on Wallet.
- Repeat at 390px and 1280px on `/admin` as an admin: Providers · Reviews · Users · Menu; no strip; the same header.

- [ ] **Step 3: Record the follow-ups**

Append to `docs/superpowers/follow-ups.md`, in its existing numbered format, continuing from its last number:

```markdown
- **Reviews tab count.** `consoleNav("platform")` declares `count: "flaggedReviews"` on Reviews; `console-counts.tsx` resolves nothing for it until the reviews read exposes a pending/flagged count. Wire it there when it does.
- **Messages badge counts the loaded page only.** `WorkspaceCounts` counts threads with `unreadCount > 0` among loaded pages. An aggregate unread-thread count on `communicationProviderThreads` would make it exact.
- **The strip's "what happens next" link.** The spec's not-live strip carries a link to what happens next; no destination exists for it yet. Add one when the company/support pages land, and link the strip to it.
- **Unused locale keys.** `nav.management`, `nav.organization` (provider.json) and `nav.platform` (both) are no longer read. Remove them in the Phase 5 locale sweep.
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/follow-ups.md
git commit -m "docs: follow-ups from the console shell and mobile navigation release" \
  -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" \
  -m "Claude-Session: https://claude.ai/code/session_0137neNHJJv594fiF8cKvt5v"
```

**Phases 1 and 2 ship here, as one release.** Phase 3 (lists and their states), Phase 4 (detail pages and Messages) and Phase 5 (dashboards, forms, the last of the drift) each get their own plan from the same spec.

## Handoff to the bookings plan

`2026-09-02-provider-bookings-phase-1.md` Task 8 now targets `shared/lib/console-nav.ts` (see Task 7, Step 6 above). Its sidebar entry becomes: `bookings` first in `WORKSPACE.work`, `primary: true`, `count: "bookingRequests"`, `shortKey: "navShort.bookings"`; `services` loses `primary`; `console-counts.tsx`'s `WorkspaceCounts` gains `bookingRequests` from that plan's stats read; the `console-nav.test.ts` "provider bar" case becomes `["bookings", "messages", "availability"]`.
