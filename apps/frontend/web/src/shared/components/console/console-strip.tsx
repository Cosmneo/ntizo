import { useTranslation } from "react-i18next";
import { AlertTriangle, Clock, Percent } from "lucide-react";
import { cn } from "@ntizo/frontend-ui";
import type { ProviderStatus } from "@/features/provider/domain/types";
import { isWorkspaceLive } from "@/features/provider/domain/workspace-status";

/**
 * The row under the header, carrying whichever fact about the workspace is
 * true right now: the platform's share when it is live, or why nothing it
 * publishes can be seen when it is not.
 *
 * In the shell, not on Overview — for the reason the commission was already
 * here: a bookmark straight to `/services/new` or an already-open tab never
 * passes through Overview, and a workspace that has been sitting unapproved
 * for ten days has to be told so on every screen, not the one it happens not
 * to open.
 *
 * Pending and suspended stay told apart. Both mean invisible, but one is
 * waiting on us and the other is a decision already taken, and a provider can
 * only act on the difference.
 *
 * Its own row rather than a squeeze into the header: that row already once
 * collided on a 390px screen, and this is the one element a Terms clause
 * depends on.
 */
export function ConsoleStrip({
  status,
  commission,
}: {
  status: ProviderStatus;
  /** Already formatted for the locale, or null while the detail is loading. */
  commission: string | null;
}) {
  const { t } = useTranslation("provider");

  if (isWorkspaceLive(status)) {
    return (
      <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-sidebar-border bg-muted/40 px-4 text-xs text-muted-foreground md:px-6">
        <Percent className="h-3 w-3 shrink-0" aria-hidden="true" />
        {/* `min-w-0` beside `truncate`: a flex child defaults to
            `min-width: auto` and refuses to shrink, so `truncate` alone does
            nothing and the row overflows instead. */}
        <span className="min-w-0 truncate">{t("commissionRateLabel")}</span>
        <span className="shrink-0 font-medium text-foreground">{commission ?? "—"}</span>
      </div>
    );
  }

  const suspended = status === "suspended";
  const Icon = suspended ? AlertTriangle : Clock;
  return (
    <div
      role="status"
      className={cn(
        "flex min-h-8 shrink-0 items-center gap-1.5 border-b border-sidebar-border px-4 py-1 text-xs md:px-6",
        suspended
          ? "bg-[color-mix(in_srgb,var(--color-destructive)_10%,transparent)] text-[var(--color-destructive)]"
          : "bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] text-[var(--color-foreground)]",
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="shrink-0 font-medium">
        {t(suspended ? "workspaceStatus.suspendedTitle" : "workspaceStatus.pendingTitle")}
      </span>
      {/* The sentence that explains it, where there is room. On a phone the
          title alone is the honest amount that fits on one row. */}
      <span className="hidden min-w-0 truncate text-[var(--color-muted-foreground)] md:inline">
        {t(suspended ? "workspaceStatus.suspendedBody" : "workspaceStatus.pendingBody")}
      </span>
    </div>
  );
}
