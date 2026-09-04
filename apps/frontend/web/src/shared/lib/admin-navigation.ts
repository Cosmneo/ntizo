import {
  Activity,
  Briefcase,
  CalendarCheck,
  LayoutDashboard,
  LifeBuoy,
  Mail,
  MessageSquareQuote,
  Tags,
  Users,
} from "lucide-react";
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
      // After users, before the catalog: a queue of messages arriving, worked
      // daily like the provider queue — not content the platform curates.
      // The help center's "Suporte" queue lands beside it (its own spec).
      { titleKey: "nav.contact", url: "/admin/contact", icon: Mail },
      { titleKey: "nav.support", url: "/admin/support", icon: LifeBuoy },
      // After the two message queues, and for the same reason they sit where
      // they do: this is work arriving rather than content the platform
      // curates. A booking nobody closed, a customer's window running out, a
      // complaint waiting on a decision — all three are somebody's money or
      // somebody's time held up until an administrator looks.
      { titleKey: "nav.bookings", url: "/admin/bookings", icon: CalendarCheck },
      // The catalog last: it is set up once and revisited, where the three
      // above are looked at daily.
      { titleKey: "nav.categories", url: "/admin/categories", icon: Tags },
      // Beside the catalog rather than beside the queues: like categories,
      // this is content the platform curates and revisits, not a stream of
      // work arriving. What it decides is what the home page says.
      { titleKey: "nav.reviews", url: "/admin/reviews", icon: MessageSquareQuote },
      // Last, and read rather than worked: the audit trail is where you go to
      // find out what was already done, not somewhere anything gets done.
      { titleKey: "nav.activity", url: "/admin/activity", icon: Activity },
    ],
  },
] as const;
