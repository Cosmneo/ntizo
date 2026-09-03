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
import { useAwaitingCount } from "@/features/provider/bookings/viewmodel/use-provider-bookings";

export function SidebarNav() {
  const { t } = useTranslation("provider");
  const { location } = useRouterState();
  const { activeProvider } = useActiveProvider();
  const slug = activeProvider?.slug;
  // The one number in this zone that is somebody else's clock running out, so
  // it is the one the nav carries. Nothing else here counts anything: a badge
  // on every item is a badge nobody reads.
  const awaiting = useAwaitingCount(activeProvider?.id);

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
                        {/* `truncate` said here rather than inherited from the
                            kit's `[&>span:last-child]` rule, which the badge
                            below now answers to instead. It is load-bearing:
                            `overflow: hidden` is what lets this span shrink
                            past its own text, and without it the collapsed
                            rail is as wide as the longest label. */}
                        <span className="truncate">{t(item.titleKey)}</span>
                        {/* Hidden on the collapsed rail rather than squeezed
                            into it — 32px holds the icon and nothing else. */}
                        {item.titleKey === "nav.bookings" && awaiting > 0 && (
                          <span className="ml-auto shrink-0 rounded-full bg-[var(--color-primary)] px-2 py-0.5 text-[11px] font-bold text-[var(--color-primary-foreground)] tabular-nums group-data-[collapsible=icon]:hidden">
                            {awaiting}
                          </span>
                        )}
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
