import { LayoutDashboard, Users } from "lucide-react";
import type { NavGroup } from "@/shared/lib/navigation";

/** The admin zone: the platform. Same rule as the provider zone — no personal account. */
export const adminNavGroups: readonly NavGroup[] = [
  { labelKey: "nav.platform", items: [
    { titleKey: "nav.dashboard", url: "/admin/dashboard", icon: LayoutDashboard },
    { titleKey: "nav.users", url: "/admin/users", icon: Users },
  ] },
] as const;
