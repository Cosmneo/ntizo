import type { ReactNode } from "react";
import { SiteHeader } from "@/shared/components/site-header";

/**
 * Layout for the signed-in customer pages.
 *
 * Deliberately not the provider or admin shell: those are workspaces with a
 * sidebar full of tools. A customer has four pages, so a plain header over
 * the content is the whole navigation they need — the rest is in the account
 * menu they arrived from.
 */
export function CustomerShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-svh bg-[var(--color-background)]">
      <SiteHeader />
      <main className="page-shell py-10">
        {/* Narrower measure inside the shared column, so the reading width is
            comfortable while the gutters match every other page. */}
        <div className="mx-auto max-w-3xl">{children}</div>
      </main>
    </div>
  );
}
