import { LayoutDashboard, Settings, User, Users } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

export interface NavItem { titleKey: string; url: string; icon: ComponentType<SVGProps<SVGSVGElement>>; }
export interface NavGroup { labelKey: string; items: readonly NavItem[]; }

export const providerNavGroups: readonly NavGroup[] = [
  { labelKey: "nav.work", items: [{ titleKey: "nav.overview", url: "/provider/overview", icon: LayoutDashboard }] },
  { labelKey: "nav.management", items: [{ titleKey: "nav.members", url: "/provider/members", icon: Users }] },
  { labelKey: "nav.organization", items: [
    { titleKey: "nav.settings", url: "/provider/settings", icon: Settings },
    { titleKey: "nav.myAccount", url: "/provider/account", icon: User },
  ] },
] as const;
