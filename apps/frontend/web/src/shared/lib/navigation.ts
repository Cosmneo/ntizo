import { Activity, Briefcase, CalendarClock, LayoutDashboard, Settings, Users, Wallet } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

export interface NavItem {
  titleKey: string;
  /** A route template containing `$slug`, filled in by the sidebar. */
  url: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}
export interface NavGroup { labelKey: string; items: readonly NavItem[]; }

/**
 * The provider zone: the workspace, and nothing else.
 *
 * No personal account here — not profile, not addresses, not payment methods.
 * Those belong to the person, who reaches them by switching to the customer
 * zone; this zone belongs to the organization. An earlier revision mounted the
 * whole account area here and it was wrong twice over: it gave every account
 * page two homes, and it said a workspace is a place you manage yourself.
 */
export const providerNavGroups: readonly NavGroup[] = [
  { labelKey: "nav.work", items: [
    // Above overview: what a provider sells is the thing this zone exists
    // to manage, and a dashboard of numbers about it is secondary.
    { titleKey: "nav.services", url: "/provider/$slug/services", icon: Briefcase },
    // Beside services rather than under management: setting when you work
    // is as much a part of the job as what you sell, and every member —
    // owner, admin or staff — has their own week to set here, not just
    // whoever administers the workspace.
    { titleKey: "nav.availability", url: "/provider/$slug/availability", icon: CalendarClock },
    { titleKey: "nav.overview", url: "/provider/$slug/overview", icon: LayoutDashboard },
    // Under the overview rather than above it: the dashboard answers "how is
    // the workspace doing", and this answers "what changed since I last
    // looked" — the second question, and the one asked less often.
    { titleKey: "nav.activity", url: "/provider/$slug/activity", icon: Activity },
  ] },
  { labelKey: "nav.management", items: [
    { titleKey: "nav.members", url: "/provider/$slug/members", icon: Users },
    // Under management rather than under work: the balance is something a
    // workspace's administrators look after, not something anybody does a
    // job in.
    { titleKey: "nav.wallet", url: "/provider/$slug/wallet", icon: Wallet },
  ] },
  { labelKey: "nav.organization", items: [
    { titleKey: "nav.settings", url: "/provider/$slug/settings", icon: Settings },
  ] },
] as const;
