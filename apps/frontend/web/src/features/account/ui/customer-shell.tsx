import type { ReactNode } from "react";
import { SiteHeader } from "@/shared/components/site-header";

/**
 * Layout for the signed-in customer pages that are not account settings —
 * bookings, messages, favourites.
 *
 * Deliberately not the provider or admin shell: those are workspaces with a
 * sidebar full of tools. These are three destinations reached from the
 * account menu, so a header over the content is the whole navigation.
 *
 * The account settings nest one level deeper and add their own sidebar; see
 * `AccountShell`.
 */
export function CustomerShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-svh bg-[var(--color-background)]">
      <SiteHeader />
      <main className="page-shell py-10">
        {/* Full column. Pages that want a narrower measure set their own —
            constraining here squeezed the account settings' sidebar and
            content together into a third of the page. */}
        {children}
      </main>
    </div>
  );
}
