import { useEffect, type ReactNode } from "react";
import { applyThemePreference, readThemePreference } from "@/shared/lib/theme";
import { MobileNav } from "@/shared/components/mobile-nav";
import { HelpCenterProvider } from "@/features/help-center/viewmodel/use-help-center";
import { HelpCenter } from "@/features/help-center/ui/help-center";
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
    // Four declarations of one icon, because four different consumers answer
    // the question differently and none of them falls back to the others.
    //
    // The SVG is what Chrome, Firefox and Edge pick, and the only one that
    // stays sharp on a retina tab. Safari does not read SVG favicons at all,
    // so the raster entries are not belt-and-braces for it — they are the
    // icon. `.ico` additionally answers the request a browser makes on its
    // own, for a bookmark or a crawler or an address-bar hit that never
    // parsed this document; without a file at that exact path it is a 404.
    // And iOS wants its own, larger, un-rounded PNG for a home-screen
    // shortcut, which it will not take as an SVG either.
    links: [
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon.ico", sizes: "32x32" },
      { rel: "icon", href: "/favicon-96.png", type: "image/png", sizes: "96x96" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
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
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const ownChrome = zoneOwnsChrome(pathname);

  return (
    <RootDocument>
      <QueryClientProvider client={queryClient}>
        <HelpCenterProvider>
          {/* Bottom padding only where the bar exists, so content on a phone
              can scroll clear of it instead of ending underneath. Where
              there is no bar there must be no padding either: the zone
              shells size themselves to the full viewport, and 56px of
              padding under that is what made the document taller than the
              screen. */}
          <div className={ownChrome ? undefined : "pb-14 md:pb-0"}>
            <Outlet />
          </div>
          {!ownChrome && <MobileNav />}
          {/* Mounted for every page; it decides internally where its launcher
              may appear (`showsHelpLauncher`) and stays mounted even where it
              may not, so the footer's "talk to support" and a booking's "need
              help" can still open it. */}
          <HelpCenter />
          <Toaster position="bottom-right" richColors closeButton />
        </HelpCenterProvider>
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
