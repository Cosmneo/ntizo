import { Activity, Briefcase, LayoutDashboard, Tags, Users } from "lucide-react";
import type { NavGroup } from "@/shared/lib/navigation";

/** The admin zone: the platform. Same rule as the provider zone — no personal account. */
export const adminNavGroups: readonly NavGroup[] = [
  {
    labelKey: "nav.platform",
    items: [
      { titleKey: "nav.dashboard", url: "/admin/dashboard", icon: LayoutDashboard },
      // Providers before users: the review queue is the work this zone exists
      // for, and the user list is where you go when something about one of
      // them needs looking at.
      { titleKey: "nav.providers", url: "/admin/providers", icon: Briefcase },
      { titleKey: "nav.users", url: "/admin/users", icon: Users },
      // The catalog last: it is set up once and revisited, where the two above
      // are looked at daily.
      { titleKey: "nav.categories", url: "/admin/categories", icon: Tags },
      // Last, and read rather than worked: the audit trail is where you go to
      // find out what was already done, not somewhere anything gets done.
      { titleKey: "nav.activity", url: "/admin/activity", icon: Activity },
    ],
  },
] as const;
