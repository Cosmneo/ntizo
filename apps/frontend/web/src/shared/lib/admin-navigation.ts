import { LayoutDashboard, Users } from "lucide-react";
import type { NavGroup } from "@/shared/lib/navigation";

export const adminNavGroups: readonly NavGroup[] = [
  { labelKey: "nav.platform", items: [
    { titleKey: "nav.dashboard", url: "/admin/dashboard", icon: LayoutDashboard },
    { titleKey: "nav.users", url: "/admin/users", icon: Users },
  ] },
] as const;
