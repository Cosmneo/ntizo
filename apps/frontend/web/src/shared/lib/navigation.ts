import { LayoutDashboard, Settings, Users } from "lucide-react";
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
  { labelKey: "nav.work", items: [{ titleKey: "nav.overview", url: "/provider/$slug/overview", icon: LayoutDashboard }] },
  { labelKey: "nav.management", items: [{ titleKey: "nav.members", url: "/provider/$slug/members", icon: Users }] },
  { labelKey: "nav.organization", items: [
    { titleKey: "nav.settings", url: "/provider/$slug/settings", icon: Settings },
  ] },
] as const;
