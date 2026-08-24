import { Briefcase, Compass, LayoutGrid, Users } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

export interface PublicNavItem {
  /**
   * Namespace-qualified translation key.
   *
   * Qualified because the two consumers load different namespaces — the header
   * `landing`, the phone bar `common` — and a bare key resolved in one and
   * rendered as itself in the other. The bottom bar shipped reading
   * "nav.explore" until a live probe caught it.
   */
  key: string;
  to: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

/**
 * The public app's main destinations, described once.
 *
 * Read by the header's centre pill and by the phone's bottom bar. They were two
 * lists that happened to agree, which is a state that lasts until somebody adds
 * a destination to one of them.
 *
 * Categories points at the directory because there is no categories page yet.
 * That is a placeholder and worth saying out loud — two entries leading to the
 * same screen is a thing to fix, not a thing to preserve.
 */
export const PUBLIC_NAV: readonly PublicNavItem[] = [
  { key: "landing:nav.explore", to: "/", icon: Compass },
  { key: "landing:nav.categories", to: "/categories", icon: LayoutGrid },
  // Services before providers: a customer arrives wanting a haircut, not
  // wanting a particular barber. The provider list answers the second
  // question and is the rarer one.
  { key: "landing:nav.services", to: "/services", icon: Briefcase },
  { key: "landing:nav.providers", to: "/providers", icon: Users },
] as const;
