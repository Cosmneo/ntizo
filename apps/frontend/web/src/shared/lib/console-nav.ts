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
