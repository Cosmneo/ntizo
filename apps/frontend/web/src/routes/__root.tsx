import { useEffect, type ReactNode } from "react";
import { applyThemePreference, readThemePreference } from "@/shared/lib/theme";
import { MobileNav } from "@/shared/components/mobile-nav";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
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

  return (
    <RootDocument>
      <QueryClientProvider client={queryClient}>
        {/* Bottom padding only where the bar exists, so content on a phone
            can scroll clear of it instead of ending underneath. */}
        <div className="pb-14 md:pb-0">
          <Outlet />
        </div>
        <MobileNav />
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
