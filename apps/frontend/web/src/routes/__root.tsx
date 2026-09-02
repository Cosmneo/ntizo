import { useEffect, type ReactNode } from "react";
import { applyThemePreference, readThemePreference } from "@/shared/lib/theme";
import { MobileNav } from "@/shared/components/mobile-nav";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { zoneOwnsChrome } from "@/shared/lib/zones";
import { QueryClientProvider } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { Toaster } from "sonner";

import "@/shared/lib/i18n";
import "@/styles.css";
import { queryClient } from "@/lib/query-client";

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  ssr: true,
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1.0" },
      { title: "Ntizo" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  // Re-applies the stored theme on every load. Without it the preference is
  // written and then ignored: the class lives on <html>, which the server
  // renders without it, so a dark-mode user gets a white page until they
  // reopen the menu.
  useEffect(() => applyThemePreference(readThemePreference()), []);

  // The provider and admin zones draw their own navigation — a sidebar, with
  // its trigger in their header. The customer bottom bar over that is a second
  // navigation whose four destinations all lead out of the zone the person is
  // working in, and it covered the last row of every list on a phone.
  // Checkout is in the same list, for its own reason — see `zoneOwnsChrome`.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const ownChrome = zoneOwnsChrome(pathname);

  return (
    <RootDocument>
      <QueryClientProvider client={queryClient}>
        {/* Bottom padding only where the bar exists, so content on a phone can
            scroll clear of it instead of ending underneath. Where there is no
            bar there must be no padding either: the zone shells size
            themselves to the full viewport, and 56px of padding under that is
            what made the document taller than the screen. */}
        <div className={ownChrome ? undefined : "pb-14 md:pb-0"}>
          <Outlet />
        </div>
        {!ownChrome && <MobileNav />}
        <Toaster position="bottom-right" richColors closeButton />
      </QueryClientProvider>
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
