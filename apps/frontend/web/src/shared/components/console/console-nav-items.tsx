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
