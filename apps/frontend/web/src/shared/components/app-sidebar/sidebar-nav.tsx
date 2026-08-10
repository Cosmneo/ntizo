import { useTranslation } from "react-i18next";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@ntizo/frontend-ui";
import { providerNavGroups } from "@/shared/lib/navigation";
import { useActiveProvider } from "@/features/provider/viewmodel/use-active-provider";

export function SidebarNav() {
  const { t } = useTranslation("provider");
  const { location } = useRouterState();
  const { activeProvider } = useActiveProvider();
  const slug = activeProvider?.slug;

  return (
    <>
      {providerNavGroups.map((group) => (
        <SidebarGroup key={group.labelKey}>
          <SidebarGroupLabel>{t(group.labelKey)}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => {
                const Icon = item.icon;
                // The template is what React Router matches on; the resolved
                // path is what the current location is compared against.
                const href = slug ? item.url.replace("$slug", slug) : null;
                const isActive = href
                  ? location.pathname.startsWith(href)
                  : false;
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={t(item.titleKey)}
                    >
                      <Link to={item.url} params={{ slug: slug ?? "" }}>
                        <Icon />
                        <span>{t(item.titleKey)}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}
